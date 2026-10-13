//! Small image-processing helpers on flat `Vec<f32>` buffers (row-major, interleaved channels).

use rayon::prelude::*;

pub fn percentile(v: &mut [f32], p: f64) -> f32 {
    let k = ((v.len() - 1) as f64 * p / 100.0).round() as usize;
    *v.select_nth_unstable_by(k, f32::total_cmp).1
}

pub fn median(v: &mut [f32]) -> f32 {
    percentile(v, 50.0)
}

/// Separable Gaussian blur, edges clamped.
pub fn blur(src: &[f32], w: usize, h: usize, ch: usize, sigma: f32) -> Vec<f32> {
    let r = (sigma * 4.0).ceil() as isize;
    let mut k: Vec<f32> = (-r..=r).map(|i| (-(i * i) as f32 / (2.0 * sigma * sigma)).exp()).collect();
    let s: f32 = k.iter().sum();
    k.iter_mut().for_each(|v| *v /= s);
    let mut tmp = vec![0f32; src.len()];
    tmp.par_chunks_mut(w * ch).enumerate().for_each(|(y, row)| {
        let s = &src[y * w * ch..(y + 1) * w * ch];
        for x in 0..w {
            for (i, kv) in k.iter().enumerate() {
                let xx = (x as isize + i as isize - r).clamp(0, w as isize - 1) as usize;
                for c in 0..ch {
                    row[x * ch + c] += kv * s[xx * ch + c];
                }
            }
        }
    });
    let mut out = vec![0f32; src.len()];
    out.par_chunks_mut(w * ch).enumerate().for_each(|(y, row)| {
        for (i, kv) in k.iter().enumerate() {
            let yy = (y as isize + i as isize - r).clamp(0, h as isize - 1) as usize;
            for (o, v) in row.iter_mut().zip(&tmp[yy * w * ch..(yy + 1) * w * ch]) {
                *o += kv * v;
            }
        }
    });
    out
}

/// 5x5 median of a single-channel image, edges clamped.
pub fn median5(src: &[f32], w: usize, h: usize) -> Vec<f32> {
    let mut out = vec![0f32; src.len()];
    out.par_chunks_mut(w).enumerate().for_each(|(y, row)| {
        let mut buf = [0f32; 25];
        for (x, o) in row.iter_mut().enumerate() {
            let mut n = 0;
            for dy in -2..=2isize {
                let yy = (y as isize + dy).clamp(0, h as isize - 1) as usize;
                for dx in -2..=2isize {
                    let xx = (x as isize + dx).clamp(0, w as isize - 1) as usize;
                    buf[n] = src[yy * w + xx];
                    n += 1;
                }
            }
            *o = *buf.select_nth_unstable_by(12, f32::total_cmp).1;
        }
    });
    out
}

/// Box dilation / erosion of a 0/1 mask with a k x k square; pixels outside the image are ignored.
pub fn morph(src: &[u8], w: usize, h: usize, k: usize, dilate: bool) -> Vec<u8> {
    let r = k / 2;
    let pass = |src: &[u8], len: usize, lines: usize, stride: usize, line_stride: usize| -> Vec<u8> {
        let mut out = vec![0u8; src.len()];
        let mut pre = vec![0u32; len + 1];
        for l in 0..lines {
            for i in 0..len {
                pre[i + 1] = pre[i] + src[l * line_stride + i * stride] as u32;
            }
            for i in 0..len {
                let (a, b) = (i.saturating_sub(r), (i + r + 1).min(len));
                let ones = pre[b] - pre[a];
                out[l * line_stride + i * stride] = if dilate { ones > 0 } else { ones as usize == b - a } as u8;
            }
        }
        out
    };
    let horizontal = pass(src, w, h, 1, w);
    pass(&horizontal, h, w, w, 1)
}

/// 4-connected components of a mask: label per pixel (0 = outside the mask) and the size of each label.
pub fn components(mask: &[bool], w: usize, h: usize) -> (Vec<u32>, Vec<usize>) {
    let mut label = vec![0u32; w * h];
    let mut sizes = vec![0usize];
    let mut stack = Vec::new();
    for start in 0..w * h {
        if !mask[start] || label[start] != 0 {
            continue;
        }
        let id = sizes.len() as u32;
        sizes.push(0);
        label[start] = id;
        stack.push(start);
        while let Some(i) = stack.pop() {
            sizes[id as usize] += 1;
            let (x, y) = (i % w, i / w);
            let mut push = |j: usize| {
                if mask[j] && label[j] == 0 {
                    label[j] = id;
                    stack.push(j);
                }
            };
            if x > 0 {
                push(i - 1);
            }
            if x + 1 < w {
                push(i + 1);
            }
            if y > 0 {
                push(i - w);
            }
            if y + 1 < h {
                push(i + w);
            }
        }
    }
    (label, sizes)
}
/// Chamfer distance to the nearest `false` pixel (the outside of the image counts as `false`).
pub fn distance(mask: &[bool], w: usize, h: usize) -> Vec<f32> {
    const D: f32 = std::f32::consts::SQRT_2;
    let mut d: Vec<f32> = mask.iter().map(|&m| if m { f32::MAX } else { 0.0 }).collect();
    let at = |d: &[f32], x: isize, y: isize| {
        if x < 0 || y < 0 || x >= w as isize || y >= h as isize { 0.0 } else { d[y as usize * w + x as usize] }
    };
    for y in 0..h as isize {
        for x in 0..w as isize {
            let v = (at(&d, x - 1, y) + 1.0).min(at(&d, x, y - 1) + 1.0).min(at(&d, x - 1, y - 1) + D).min(at(&d, x + 1, y - 1) + D);
            let i = y as usize * w + x as usize;
            d[i] = d[i].min(v);
        }
    }
    for y in (0..h as isize).rev() {
        for x in (0..w as isize).rev() {
            let v = (at(&d, x + 1, y) + 1.0).min(at(&d, x, y + 1) + 1.0).min(at(&d, x + 1, y + 1) + D).min(at(&d, x - 1, y + 1) + D);
            let i = y as usize * w + x as usize;
            d[i] = d[i].min(v);
        }
    }
    d
}

/// Mean over b x b blocks.
pub fn bin(src: &[f32], w: usize, h: usize, ch: usize, b: usize) -> Vec<f32> {
    let (ws, hs) = (w / b, h / b);
    let mut out = vec![0f32; ws * hs * ch];
    out.par_chunks_mut(ws * ch).enumerate().for_each(|(ys, row)| {
        for y in ys * b..(ys + 1) * b {
            for xs in 0..ws {
                for x in xs * b..(xs + 1) * b {
                    for c in 0..ch {
                        row[xs * ch + c] += src[(y * w + x) * ch + c];
                    }
                }
            }
        }
        row.iter_mut().for_each(|v| *v /= (b * b) as f32);
    });
    out
}

/// Bilinear sample of one channel; coordinates outside the image are clamped.
#[inline]
pub fn sample_clamped(src: &[f32], w: usize, h: usize, ch: usize, c: usize, x: f32, y: f32) -> f32 {
    let x = x.clamp(0.0, (w - 1) as f32);
    let y = y.clamp(0.0, (h - 1) as f32);
    let (x0, y0) = ((x as usize).min(w - 2), (y as usize).min(h - 2));
    let (fx, fy) = (x - x0 as f32, y - y0 as f32);
    let i = (y0 * w + x0) * ch + c;
    (src[i] * (1.0 - fx) + src[i + ch] * fx) * (1.0 - fy) + (src[i + w * ch] * (1.0 - fx) + src[i + w * ch + ch] * fx) * fy
}

/// Bilinear sample of all channels, `None` outside the image.
#[inline]
pub fn sample<const C: usize>(src: &[f32], w: usize, h: usize, x: f64, y: f64) -> Option<[f32; C]> {
    if !(x >= 0.0 && y >= 0.0 && x < (w - 1) as f64 && y < (h - 1) as f64) {
        return None;
    }
    let (x0, y0) = (x as usize, y as usize);
    let (fx, fy) = ((x - x0 as f64) as f32, (y - y0 as f64) as f32);
    let i = (y0 * w + x0) * C;
    let mut out = [0f32; C];
    for c in 0..C {
        out[c] = (src[i + c] * (1.0 - fx) + src[i + C + c] * fx) * (1.0 - fy)
            + (src[i + w * C + c] * (1.0 - fx) + src[i + w * C + C + c] * fx) * fy;
    }
    Some(out)
}

/// Demosaic of an RGGB mosaic (works on signed data).
///
/// `sharp` selects Malvar-He-Cutler, which is crisper on ordinary scenes; it borrows detail
/// across colour channels though, which tints point-like stars, so star frames use plain
/// bilinear interpolation (the sub-pixel drift between frames restores the resolution).
pub fn demosaic(c: &[f32], w: usize, h: usize, sharp: bool) -> Vec<f32> {
    let mut out = vec![0f32; 3 * w * h];
    let (wi, hi) = (w as isize, h as isize);
    let (px, py) = bayer_phase();
    for (y, row) in out.chunks_mut(3 * w).enumerate() {
        for x in 0..w {
            // mirror at the borders without changing the Bayer phase
            let p = |dy: isize, dx: isize| {
                let (mut yy, mut xx) = (y as isize + dy, x as isize + dx);
                if yy < 0 {
                    yy = -yy
                } else if yy >= hi {
                    yy = 2 * (hi - 1) - yy
                }
                if xx < 0 {
                    xx = -xx
                } else if xx >= wi {
                    xx = 2 * (wi - 1) - xx
                }
                c[yy as usize * w + xx as usize]
            };
            let ctr = p(0, 0);
            let (hp, vp) = (p(0, -1) + p(0, 1), p(-1, 0) + p(1, 0));
            let diag = p(-1, -1) + p(-1, 1) + p(1, -1) + p(1, 1);
            let (fh, fv) = (p(0, -2) + p(0, 2), p(-2, 0) + p(2, 0));
            let (green, opposite, along_h, along_v) = if sharp {
                (
                    (4.0 * ctr + 2.0 * (hp + vp) - (fh + fv)) / 8.0,
                    (6.0 * ctr + 2.0 * diag - 1.5 * (fh + fv)) / 8.0,
                    (5.0 * ctr + 4.0 * hp - diag - fh + 0.5 * fv) / 8.0,
                    (5.0 * ctr + 4.0 * vp - diag - fv + 0.5 * fh) / 8.0,
                )
            } else {
                ((hp + vp) / 4.0, diag / 4.0, hp / 2.0, vp / 2.0)
            };
            let rgb = match ((y + py) & 1, (x + px) & 1) {
                (0, 0) => [ctr, green, opposite],
                (1, 1) => [opposite, green, ctr],
                (0, 1) => [along_h, ctr, along_v],
                _ => [along_v, ctr, along_h],
            };
            row[3 * x..3 * x + 3].copy_from_slice(&rgb);
        }
    }
    out
}

/// Bayer layout of the sensor: the shift that turns it into RGGB, as x + 2 * y. Set once at start.
static BAYER_PHASE: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

pub fn set_bayer_phase(phase: (usize, usize)) {
    BAYER_PHASE.store(phase.0 + 2 * phase.1, std::sync::atomic::Ordering::Relaxed);
}

#[inline]
pub fn bayer_phase() -> (usize, usize) {
    let p = BAYER_PHASE.load(std::sync::atomic::Ordering::Relaxed);
    (p & 1, p >> 1)
}

/// Colour channel (0 = red, 1 = green, 2 = blue) of a sensor pixel.
#[inline]
pub fn cfa_channel(x: usize, y: usize) -> usize {
    let (px, py) = bayer_phase();
    ((x + px) & 1) + ((y + py) & 1)
}

/// Pick the mosaic sample out of an RGB image.
pub fn mosaic_from(f: impl Fn(usize, usize, usize) -> f32 + Sync, w: usize, h: usize) -> Vec<f32> {
    let mut out = vec![0f32; w * h];
    out.par_chunks_mut(w).enumerate().for_each(|(y, row)| {
        for (x, o) in row.iter_mut().enumerate() {
            *o = f(x, y, cfa_channel(x, y));
        }
    });
    out
}

/// Bicubic (Catmull-Rom) sample of an RGB image, edges clamped.
#[inline]
pub fn sample_cubic(src: &[f32], w: usize, h: usize, x: f32, y: f32) -> [f32; 3] {
    let weights = |t: f32| {
        [((-0.5 * t + 1.0) * t - 0.5) * t, (1.5 * t - 2.5) * t * t + 1.0, ((-1.5 * t + 2.0) * t + 0.5) * t, (0.5 * t - 0.5) * t * t]
    };
    let (x0, y0) = (x.floor(), y.floor());
    let (wx, wy) = (weights(x - x0), weights(y - y0));
    let mut out = [0f32; 3];
    for (j, wyj) in wy.iter().enumerate() {
        let yy = (y0 as isize + j as isize - 1).clamp(0, h as isize - 1) as usize;
        for (i, wxi) in wx.iter().enumerate() {
            let xx = (x0 as isize + i as isize - 1).clamp(0, w as isize - 1) as usize;
            let k = (yy * w + xx) * 3;
            for c in 0..3 {
                out[c] += wyj * wxi * src[k + c];
            }
        }
    }
    out
}