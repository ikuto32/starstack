//! Minimal reader for uncompressed 16-bit Bayer DNG files (as written by Pixel phones).

use std::collections::HashMap;
use std::path::Path;

pub struct Dng {
    pub w: usize,
    pub h: usize,
    pub data: Vec<u16>,
    pub black: f32,
    /// Bayer layout as the shift (x, y) that turns it into RGGB
    pub phase: (usize, usize),
    /// raw value at which a pixel is saturated
    pub white: f32,
    /// noise model from the NoiseProfile tag, in raw units: variance = shot * signal + read
    pub noise: Option<(f32, f32)>,
    /// EXIF orientation (1 = as stored, 3 = 180 deg, 6 = rotate clockwise, 8 = rotate counter-clockwise)
    pub orientation: u32,
    /// white balance multipliers (R, G, B)
    pub wb: [f32; 3],
    /// white-balanced camera RGB -> linear sRGB
    pub cam2srgb: [[f32; 3]; 3],
    /// lens shading correction from the GainMap opcodes, if present
    pub gain: Option<GainMap>,
    /// lens distortion correction from the WarpRectilinear opcode, if present:
    /// radial kr0..kr3, tangential kt0, kt1, optical centre cx, cy (relative to the image size)
    pub warp: Option<[f64; 8]>,
    /// 35 mm equivalent focal length from the EXIF data, if present
    pub focal35: Option<f64>,
    /// capture time as a Julian date (the camera's local time is taken as it is)
    pub julian_date: Option<f64>,
}

/// "YYYY:MM:DD HH:MM:SS" -> Julian date
fn julian_date(text: &[u8]) -> Option<f64> {
    let s = std::str::from_utf8(text.get(..19)?).ok()?;
    let n: Vec<f64> = s.split([':', ' ']).map(|p| p.parse().ok()).collect::<Option<_>>()?;
    let (mut y, mut m) = (n[0], n[1]);
    if m <= 2.0 {
        y -= 1.0;
        m += 12.0;
    }
    let b = 2.0 - (y / 100.0).floor() + (y / 400.0).floor();
    Some((365.25 * (y + 4716.0)).floor() + (30.6001 * (m + 1.0)).floor() + n[2] + b - 1524.5 + (n[3] + n[4] / 60.0 + n[5] / 3600.0) / 24.0)
}

/// Parse OpcodeList3 (always big-endian) and return the coefficients of WarpRectilinear.
fn parse_warp(b: &[u8]) -> Option<[f64; 8]> {
    let u32_at = |o: usize| Some(u32::from_be_bytes(b.get(o..o + 4)?.try_into().ok()?) as usize);
    let f64_at = |o: usize| Some(f64::from_be_bytes(b.get(o..o + 8)?.try_into().ok()?));
    let mut o = 4;
    for _ in 0..u32_at(0)? {
        let (id, size) = (u32_at(o)?, u32_at(o + 12)?);
        let d = o + 16;
        o = d + size;
        // one set of coefficients for all colour planes is the only layout handled
        if id == 1 && u32_at(d)? == 1 {
            let mut k = [0.0; 8];
            for (i, v) in k.iter_mut().enumerate() {
                *v = f64_at(d + 4 + 8 * i)?;
            }
            return Some(k);
        }
    }
    None
}

/// Lens shading correction (vignetting and colour shading): a coarse grid of gain factors per
/// Bayer plane, spanning the whole image.
#[derive(Clone)]
pub struct GainMap {
    pub rows: usize,
    pub cols: usize,
    /// indexed by Bayer plane (row parity * 2 + column parity), each rows x cols
    pub planes: [Vec<f32>; 4],
}

/// Parse OpcodeList2 (always big-endian) and collect the four per-plane GainMap opcodes.
fn parse_gain_maps(b: &[u8]) -> Option<GainMap> {
    let u32_at = |o: usize| Some(u32::from_be_bytes(b.get(o..o + 4)?.try_into().ok()?) as usize);
    let f64_at = |o: usize| Some(f64::from_be_bytes(b.get(o..o + 8)?.try_into().ok()?));
    let mut planes: [Vec<f32>; 4] = Default::default();
    let (mut rows, mut cols) = (0, 0);
    let mut o = 4;
    for _ in 0..u32_at(0)? {
        let (id, size) = (u32_at(o)?, u32_at(o + 12)?);
        let d = o + 16;
        o = d + size;
        if id != 9 {
            continue;
        }
        let (top, left, row_pitch, col_pitch) = (u32_at(d)?, u32_at(d + 4)?, u32_at(d + 24)?, u32_at(d + 28)?);
        let (pv, ph, map_planes) = (u32_at(d + 32)?, u32_at(d + 36)?, u32_at(d + 72)?);
        let (spacing_v, spacing_h, origin_v, origin_h) = (f64_at(d + 40)?, f64_at(d + 48)?, f64_at(d + 56)?, f64_at(d + 64)?);
        // only the usual layout: one map per Bayer plane, covering the whole frame
        let spans = |spacing: f64, n: usize| (spacing * (n as f64 - 1.0) - 1.0).abs() < 1e-3;
        if row_pitch != 2 || col_pitch != 2 || map_planes != 1 || top > 1 || left > 1 || pv < 2 || ph < 2 {
            return None;
        }
        if origin_v != 0.0 || origin_h != 0.0 || !spans(spacing_v, pv) || !spans(spacing_h, ph) {
            return None;
        }
        if (rows, cols) != (0, 0) && (rows, cols) != (pv, ph) {
            return None;
        }
        (rows, cols) = (pv, ph);
        planes[top * 2 + left] = (0..pv * ph).map(|k| Some(f32::from_bits(u32_at(d + 76 + 4 * k)? as u32))).collect::<Option<_>>()?;
    }
    planes.iter().all(|p| !p.is_empty()).then_some(GainMap { rows, cols, planes })
}

struct Tiff<'a> {
    b: &'a [u8],
    le: bool,
}

/// tag -> (type, count, position of the value bytes)
type Ifd = HashMap<u16, (u16, usize, usize)>;

impl Tiff<'_> {
    fn u16(&self, o: usize) -> u16 {
        let v = [self.b[o], self.b[o + 1]];
        if self.le { u16::from_le_bytes(v) } else { u16::from_be_bytes(v) }
    }

    fn u32(&self, o: usize) -> u32 {
        let v = [self.b[o], self.b[o + 1], self.b[o + 2], self.b[o + 3]];
        if self.le { u32::from_le_bytes(v) } else { u32::from_be_bytes(v) }
    }

    fn f64(&self, o: usize) -> f64 {
        let mut v = [0u8; 8];
        v.copy_from_slice(&self.b[o..o + 8]);
        if self.le { f64::from_le_bytes(v) } else { f64::from_be_bytes(v) }
    }

    fn ifd(&self, off: usize) -> Ifd {
        let n = self.u16(off) as usize;
        let mut map = Ifd::new();
        for k in 0..n {
            let e = off + 2 + 12 * k;
            let (tag, typ, count) = (self.u16(e), self.u16(e + 2), self.u32(e + 4) as usize);
            let size = match typ {
                3 | 8 => 2,
                4 | 9 | 11 | 13 => 4,
                5 | 10 | 12 => 8,
                _ => 1,
            };
            let pos = if size * count <= 4 { e + 8 } else { self.u32(e + 8) as usize };
            map.insert(tag, (typ, count, pos));
        }
        map
    }

    fn vals(&self, ifd: &Ifd, tag: u16) -> Option<Vec<f64>> {
        let &(typ, count, pos) = ifd.get(&tag)?;
        Some(
            (0..count)
                .map(|i| match typ {
                    3 => self.u16(pos + 2 * i) as f64,
                    8 => self.u16(pos + 2 * i) as i16 as f64,
                    4 | 13 => self.u32(pos + 4 * i) as f64,
                    9 => self.u32(pos + 4 * i) as i32 as f64,
                    5 => self.u32(pos + 8 * i) as f64 / self.u32(pos + 8 * i + 4) as f64,
                    10 => self.u32(pos + 8 * i) as i32 as f64 / self.u32(pos + 8 * i + 4) as i32 as f64,
                    11 => f32::from_bits(self.u32(pos + 4 * i)) as f64,
                    12 => self.f64(pos + 8 * i),
                    _ => self.b[pos + i] as f64,
                })
                .collect(),
        )
    }
}

fn inv3(m: [[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    let mut r = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            let (a, b, c, d) = ((j + 1) % 3, (j + 2) % 3, (i + 1) % 3, (i + 2) % 3);
            r[i][j] = (m[a][c] * m[b][d] - m[a][d] * m[b][c]) / det;
        }
    }
    r
}

pub fn read(path: &Path) -> Result<Dng, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let t = Tiff { b: &bytes, le: &bytes[0..2] == b"II" };
    if t.u16(2) != 42 {
        return Err(format!("{}: not a TIFF/DNG file", path.display()));
    }
    let ifd0 = t.ifd(t.u32(4) as usize);
    // the raw image is IFD0 or one of its SubIFDs: pick the one with PhotometricInterpretation = CFA
    let is_cfa = |i: &Ifd| t.vals(i, 0x106).is_some_and(|v| v[0] == 32803.0);
    let raw = if is_cfa(&ifd0) {
        ifd0.clone()
    } else {
        t.vals(&ifd0, 0x14A)
            .unwrap_or_default()
            .iter()
            .map(|&o| t.ifd(o as usize))
            .find(|i| is_cfa(i))
            .ok_or("no CFA image found")?
    };
    let get = |i: &Ifd, tag: u16, what: &str| t.vals(i, tag).ok_or(format!("missing tag {what}"));
    let (w, h) = (get(&raw, 0x100, "width")?[0] as usize, get(&raw, 0x101, "height")?[0] as usize);
    if get(&raw, 0x103, "compression")?[0] != 1.0 || get(&raw, 0x102, "bits")?[0] != 16.0 {
        return Err("only uncompressed 16-bit DNG is supported".into());
    }
    // Bayer layout: any of the four 2 x 2 arrangements, described as RGGB shifted by (x, y)
    let cfa = get(&raw, 0x828E, "CFA pattern")?;
    let red = cfa.iter().position(|&c| c == 0.0).ok_or("no red in the CFA pattern")?;
    let phase = (red % 2, red / 2);
    let expected: Vec<f64> = (0..4).map(|k| (((k % 2 + phase.0) & 1) + ((k / 2 + phase.1) & 1)) as f64).collect();
    if cfa != expected {
        return Err("only 2 x 2 Bayer sensors are supported".into());
    }
    let mut data = Vec::with_capacity(w * h);
    for (off, len) in get(&raw, 0x111, "strip offsets")?.iter().zip(get(&raw, 0x117, "strip sizes")?) {
        let (off, len) = (*off as usize, len as usize);
        data.extend(bytes[off..off + len].chunks_exact(2).map(|p| {
            if t.le { u16::from_le_bytes([p[0], p[1]]) } else { u16::from_be_bytes([p[0], p[1]]) }
        }));
    }
    if data.len() != w * h {
        return Err("unexpected amount of pixel data".into());
    }
    let black = t.vals(&raw, 0xC61A).map_or(0.0, |v| v.iter().sum::<f64>() / v.len() as f64) as f32;

    // colour: AsShotNeutral -> white balance, ColorMatrix2 (XYZ -> camera, D65) -> camera -> sRGB
    let neutral = get(&ifd0, 0xC628, "AsShotNeutral")?;
    let cm = t.vals(&ifd0, 0xC622).or(t.vals(&ifd0, 0xC621)).ok_or("missing ColorMatrix")?;
    const XYZ_SRGB: [[f64; 3]; 3] = [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]];
    let mut cam_srgb = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            cam_srgb[i][j] = (0..3).map(|k| cm[i * 3 + k] * XYZ_SRGB[k][j]).sum();
        }
        let s: f64 = cam_srgb[i].iter().sum();
        cam_srgb[i].iter_mut().for_each(|v| *v /= s);
    }
    let inv = inv3(cam_srgb);
    let white = t.vals(&raw, 0xC61D).map_or(65535.0, |v| v[0]) as f32;
    // NoiseProfile: per colour plane (S, O) with variance = S * x + O for x scaled to 0..1
    let range = (white - black) as f64;
    let noise = t.vals(&ifd0, 0xC761).or(t.vals(&raw, 0xC761)).filter(|v| v.len() >= 2 && v.len() % 2 == 0).map(|v| {
        let planes = (v.len() / 2) as f64;
        let shot: f64 = v.iter().step_by(2).sum::<f64>() / planes;
        let read: f64 = v.iter().skip(1).step_by(2).sum::<f64>() / planes;
        ((shot * range) as f32, (read * range * range) as f32)
    });
    Ok(Dng {
        w,
        h,
        data,
        black,
        phase,
        white,
        noise,
        julian_date: ifd0.get(&0x132).and_then(|&(_, count, pos)| julian_date(bytes.get(pos..pos + count)?)),
        focal35: t.vals(&ifd0, 0x8769).and_then(|v| t.vals(&t.ifd(v[0] as usize), 0xA405)).map(|v| v[0]).filter(|&f| f > 0.0),
        warp: raw.get(&0xC74E).and_then(|&(_, count, pos)| parse_warp(bytes.get(pos..pos + count)?)),
        gain: raw.get(&0xC741).and_then(|&(_, count, pos)| parse_gain_maps(bytes.get(pos..pos + count)?)),
        orientation: t.vals(&ifd0, 0x112).map_or(1, |v| v[0] as u32),
        wb: [0, 1, 2].map(|i| (1.0 / neutral[i]) as f32),
        cam2srgb: inv.map(|r| r.map(|v| v as f32)),
    })
}
