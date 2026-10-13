//! Plate solving against a star catalogue and drawing of constellation lines and names.
//!
//! Catalogue: the d3-celestial data files `stars.6.json` (stars down to magnitude 6) and
//! `constellations.lines.json`.

use crate::img::median;
use crate::Poly;
use ab_glyph::{point, Font, FontVec, PxScale, ScaleFont};
use nalgebra::{Matrix3, Vector3};
use rayon::prelude::*;
use std::path::Path;

type V3 = Vector3<f64>;

pub struct Catalog {
    /// unit vector and magnitude, brightest first
    pub stars: Vec<(V3, f32)>,
    /// constellation abbreviation and its line strips
    pub lines: Vec<(String, Vec<Vec<V3>>)>,
    /// optional deeper star list (stars.8.json), only used to measure how deep the image goes
    pub deep: Vec<(V3, f32)>,
}

fn unit(ra_deg: f64, dec_deg: f64) -> V3 {
    let (ra, dec) = (ra_deg.to_radians(), dec_deg.to_radians());
    V3::new(dec.cos() * ra.cos(), dec.cos() * ra.sin(), dec.sin())
}

pub fn load_catalog(dir: &Path) -> Result<Catalog, String> {
    let read = |name: &str| -> Result<serde_json::Value, String> {
        let text = std::fs::read_to_string(dir.join(name)).map_err(|e| format!("{}: {e}", dir.join(name).display()))?;
        serde_json::from_str(&text).map_err(|e| format!("{name}: {e}"))
    };
    let coord = |v: &serde_json::Value| Some(unit(v.get(0)?.as_f64()?, v.get(1)?.as_f64()?));
    let features = |v: &serde_json::Value| v["features"].as_array().cloned().unwrap_or_default();
    let star_list = |v: &serde_json::Value| -> Vec<(V3, f32)> {
        features(v).iter().filter_map(|f| Some((coord(&f["geometry"]["coordinates"])?, f["properties"]["mag"].as_f64()? as f32))).collect()
    };
    let mut stars = star_list(&read("stars.6.json")?);
    stars.sort_by(|a, b| a.1.total_cmp(&b.1));
    let deep = read("stars.8.json").map(|v| star_list(&v)).unwrap_or_default();
    let lines = features(&read("constellations.lines.json")?)
        .iter()
        .filter_map(|f| {
            let strips = f["geometry"]["coordinates"].as_array()?.iter().filter_map(|s| s.as_array()?.iter().map(coord).collect::<Option<Vec<V3>>>()).collect();
            Some((f["id"].as_str()?.to_string(), strips))
        })
        .collect();
    if stars.len() < 1000 {
        return Err("star catalogue looks incomplete".into());
    }
    Ok(Catalog { stars, lines, deep })
}

/// Where the catalogue sky lands on the sensor.
pub struct Solution {
    rot: Matrix3<f64>,
    f: f64,
    w: f64,
    h: f64,
    /// correction from the ideal pinhole position to the measured position (lens distortion)
    poly: Poly,
    pub matched: usize,
    pub rms: f64,
}

impl Solution {
    fn pinhole(&self, c: &V3) -> Option<[f64; 2]> {
        let v = self.rot * c;
        (v.z > 0.15).then(|| [self.w / 2.0 + self.f * v.x / v.z, self.h / 2.0 + self.f * v.y / v.z])
    }

    /// Pixel position of a sky direction, if it is inside the frame (with a small margin).
    pub fn project(&self, c: &V3) -> Option<[f64; 2]> {
        let p = self.pinhole(c)?;
        let margin = 60.0;
        (p[0] > -margin && p[1] > -margin && p[0] < self.w + margin && p[1] < self.h + margin).then(|| self.poly.eval(p))
    }

    /// (right ascension in hours, declination in degrees) of the frame centre and the diagonal field of view.
    pub fn centre(&self) -> (f64, f64, f64) {
        let c = self.rot.transpose() * V3::z();
        let ra = c.y.atan2(c.x).to_degrees().rem_euclid(360.0) / 15.0;
        (ra, c.z.asin().to_degrees(), 2.0 * ((self.w.hypot(self.h) / 2.0) / self.f).atan().to_degrees())
    }
}

/// Best rotation taking the catalogue vectors onto the camera vectors.
fn kabsch(cat: &[V3], cam: &[V3]) -> Matrix3<f64> {
    let mut m = Matrix3::zeros();
    for (a, b) in cat.iter().zip(cam) {
        m += b * a.transpose();
    }
    let svd = m.svd(true, true);
    let (u, vt) = (svd.u.unwrap(), svd.v_t.unwrap());
    let d = (u * vt).determinant().signum();
    u * Matrix3::from_diagonal(&V3::new(1.0, 1.0, d)) * vt
}

/// Blind plate solve. `detected`: star positions (x, y) in pixels, brightest first.
/// `focal`: candidate focal lengths in pixels.
pub fn solve(cat: &Catalog, detected: &[[f64; 2]], w: usize, h: usize, focal: &[f64]) -> Option<Solution> {
    const TOP: usize = 10; // detected stars used to form triangles
    const CHECK: usize = 40; // detected stars used to verify a candidate
    if detected.len() < 20 {
        return None;
    }
    let (wf, hf) = (w as f64, h as f64);
    let bright: Vec<V3> = cat.stars.iter().take_while(|s| s.1 <= 4.0).map(|s| s.0).collect();
    let verify: Vec<V3> = cat.stars.iter().take_while(|s| s.1 <= 4.5).map(|s| s.0).collect();
    let n = bright.len();
    let angle: Vec<f32> = (0..n * n).map(|k| bright[k / n].dot(&bright[k % n]).clamp(-1.0, 1.0).acos() as f32).collect();
    let check = &detected[..CHECK.min(detected.len())];

    // number of the brightest detected stars that have a catalogue star nearby
    let score = |rot: &Matrix3<f64>, f: f64| -> usize {
        let proj: Vec<[f64; 2]> = verify
            .iter()
            .filter_map(|c| {
                let v = rot * c;
                (v.z > 0.15).then(|| [wf / 2.0 + f * v.x / v.z, hf / 2.0 + f * v.y / v.z])
            })
            .filter(|p| p[0] > -50.0 && p[1] > -50.0 && p[0] < wf + 50.0 && p[1] < hf + 50.0)
            .collect();
        check.iter().filter(|d| proj.iter().any(|p| (p[0] - d[0]).hypot(p[1] - d[1]) < 40.0)).count()
    };

    let mut tasks = Vec::new();
    for &f in focal {
        for p in 0..TOP {
            for q in p + 1..TOP {
                for r in q + 1..TOP {
                    tasks.push((f, [p, q, r]));
                }
            }
        }
    }
    let need = (check.len() * 2 / 5).max(12);
    let best = tasks
        .par_iter()
        .filter_map(|&(f, tri)| {
            let cam: Vec<V3> = tri.iter().map(|&k| V3::new((detected[k][0] - wf / 2.0) / f, (detected[k][1] - hf / 2.0) / f, 1.0).normalize()).collect();
            let side = |a: usize, b: usize| cam[a].dot(&cam[b]).clamp(-1.0, 1.0).acos() as f32;
            let (a, b, c) = (side(0, 1), side(0, 2), side(1, 2));
            if a.min(b).min(c) < 0.07 {
                return None; // too small a triangle to pin down the orientation
            }
            let tol = |s: f32| 0.02 * s + 0.004;
            let mut best: Option<(usize, Matrix3<f64>, f64)> = None;
            for i in 0..n {
                for j in 0..n {
                    if (angle[i * n + j] - a).abs() > tol(a) {
                        continue;
                    }
                    for k in 0..n {
                        if (angle[i * n + k] - b).abs() > tol(b) || (angle[j * n + k] - c).abs() > tol(c) {
                            continue;
                        }
                        let rot = kabsch(&[bright[i], bright[j], bright[k]], &cam);
                        let s = score(&rot, f);
                        if best.as_ref().is_none_or(|b| s > b.0) {
                            best = Some((s, rot, f));
                        }
                    }
                }
            }
            best.filter(|b| b.0 >= need)
        })
        .max_by_key(|b| b.0)?;

    // refine: match more and fainter stars and absorb focal length error and lens distortion in a polynomial
    let mut sol = Solution { rot: best.1, f: best.2, w: wf, h: hf, poly: Poly::identity(w, h), matched: best.0, rms: 0.0 };
    // the radius shrinks slowly, so that the correction can follow the lens distortion outwards
    // from the centre before the tolerance gets tight
    // with the deeper catalogue the last rounds use fainter stars as well: many more of them,
    // which pins the correction down in the corners
    let mut deep: Vec<(V3, f32)> = cat.deep.iter().filter(|s| s.1 <= 7.5).copied().collect();
    deep.sort_by(|a, b| a.1.total_cmp(&b.1));
    let faint = if deep.is_empty() { 6.5 } else { 7.5 };
    for (mag, radius) in [(4.5, 60.0), (5.0, 45.0), (5.5, 35.0), (6.0, 25.0), (6.5, 18.0), (6.5, 12.0), (6.5, 8.0), (6.5, 5.0), (faint, 5.0), (faint, 4.0), (faint, 3.0), (faint, 3.0)] {
        let list = if mag > 6.5 { &deep } else { &cat.stars };
        let ideal: Vec<[f64; 2]> = list.iter().take_while(|s| s.1 <= mag).filter_map(|s| sol.pinhole(&s.0)).filter(|p| p[0] > -40.0 && p[1] > -40.0 && p[0] < wf + 40.0 && p[1] < hf + 40.0).collect();
        let pred: Vec<[f64; 2]> = ideal.iter().map(|p| sol.poly.eval(*p)).collect();
        let to_det: Vec<(usize, f64)> = pred.iter().map(|p| crate::nearest(*p, detected)).collect();
        let to_pred: Vec<usize> = detected.iter().map(|d| crate::nearest(*d, &pred).0).collect();
        let pairs: Vec<(usize, usize)> = (0..pred.len()).filter(|&k| to_det[k].1 < radius && to_pred[to_det[k].0] == k).map(|k| (k, to_det[k].0)).collect();
        if pairs.len() < 12 {
            return None;
        }
        let order = match pairs.len() {
            150.. => 4,
            60.. => 3,
            25.. => 2,
            _ => 1,
        };
        let src: Vec<[f64; 2]> = pairs.iter().map(|p| ideal[p.0]).collect();
        let dst: Vec<[f64; 2]> = pairs.iter().map(|p| detected[p.1]).collect();
        let mut keep = vec![true; pairs.len()];
        for _ in 0..3 {
            let pick = |v: &[[f64; 2]]| -> Vec<[f64; 2]> { v.iter().zip(&keep).filter(|(_, &k)| k).map(|(p, _)| *p).collect() };
            sol.poly = Poly::fit(wf, hf, &pick(&src), &pick(&dst), order);
            let res: Vec<f64> = src.iter().zip(&dst).map(|(s, d)| crate::dist(sol.poly.eval(*s), *d)).collect();
            let mut kept: Vec<f32> = res.iter().zip(&keep).filter(|(_, &k)| k).map(|(r, _)| *r as f32).collect();
            let limit = (3.0 * 1.4826 * median(&mut kept) as f64).max(0.5);
            keep = res.iter().map(|&r| r < limit).collect();
            sol.matched = keep.iter().filter(|&&k| k).count();
            sol.rms = (res.iter().zip(&keep).filter(|(_, &k)| k).map(|(r, _)| r * r).sum::<f64>() / sol.matched.max(1) as f64).sqrt();
            if sol.matched < 12 {
                return None;
            }
        }
    }
    Some(sol)
}

/// Directions (J2000) of the naked-eye planets as seen from the Earth at the given Julian date,
/// from the approximate Keplerian elements published by JPL (good to a few arc minutes).
pub fn planets(jd: f64) -> Vec<(&'static str, V3)> {
    // a [au], e, inclination, mean longitude, longitude of perihelion, longitude of the node [deg], each with its rate per century
    const ELEMENTS: [(&str, [f64; 12]); 6] = [
        ("水星", [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081]),
        ("金星", [0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890, 181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418]),
        ("地球", [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0.0, 0.0]),
        ("火星", [1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343]),
        ("木星", [5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106]),
        ("土星", [9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794]),
    ];
    let t = (jd - 2451545.0) / 36525.0;
    // heliocentric position in the J2000 ecliptic frame
    let position = |k: &[f64; 12]| -> V3 {
        let at = |i: usize| k[2 * i] + k[2 * i + 1] * t;
        let (a, e, inc, l, peri, node) = (at(0), at(1), at(2).to_radians(), at(3), at(4), at(5));
        let m = (l - peri).rem_euclid(360.0).to_radians();
        let mut ecc = m;
        for _ in 0..12 {
            ecc -= (ecc - e * ecc.sin() - m) / (1.0 - e * ecc.cos());
        }
        let (x, y) = (a * (ecc.cos() - e), a * (1.0 - e * e).sqrt() * ecc.sin());
        let (w, o) = ((peri - node).to_radians(), node.to_radians());
        V3::new(
            (w.cos() * o.cos() - w.sin() * o.sin() * inc.cos()) * x + (-w.sin() * o.cos() - w.cos() * o.sin() * inc.cos()) * y,
            (w.cos() * o.sin() + w.sin() * o.cos() * inc.cos()) * x + (-w.sin() * o.sin() + w.cos() * o.cos() * inc.cos()) * y,
            w.sin() * inc.sin() * x + w.cos() * inc.sin() * y,
        )
    };
    let earth = position(&ELEMENTS[2].1);
    let eps = 23.43928f64.to_radians();
    ELEMENTS
        .iter()
        .filter(|p| p.0 != "地球")
        .map(|(name, k)| {
            let g = position(k) - earth;
            (*name, V3::new(g.x, g.y * eps.cos() - g.z * eps.sin(), g.y * eps.sin() + g.z * eps.cos()).normalize())
        })
        .collect()
}

/// Right ascension (hours) and declination (degrees) of a direction.
pub fn ra_dec(v: &V3) -> (f64, f64) {
    (v.y.atan2(v.x).to_degrees().rem_euclid(360.0) / 15.0, v.z.asin().to_degrees())
}

/// How deep the stacked image goes, from aperture photometry calibrated on the catalogue stars.
pub struct Depth {
    /// catalogue stars of magnitude 5.5 - 6.5 in the visible sky, and how many of them were detected
    pub faint_catalogue: (usize, usize),
    /// number of calibration stars and the scatter of their zero points (magnitudes)
    pub calibration: (usize, f32),
    /// magnitude of a star that stands 5 sigma above the noise: (centre of the frame, corners)
    pub limit: (f32, f32),
    /// number of detected objects and the magnitudes of the faintest ones (median of the faintest tenth)
    pub detected: (usize, f32),
    /// per half-magnitude bin: (lower edge, catalogue stars in the visible sky, of those detected,
    /// detected by chance - the same count with the catalogue positions shifted sideways)
    pub completeness: Vec<(f32, usize, usize, usize)>,
    /// median signal-to-noise ratio of the catalogue stars of magnitude 6.0 - 6.5, measured at
    /// their catalogue positions: (inner 40% of the frame, outer 30%), and how many stars each
    pub snr: (f32, f32),
    /// 5 sigma limiting magnitude against the random noise alone, if it was measured
    pub limit_random: Option<(f32, f32)>,
    pub snr_stars: (usize, usize),
}

/// `random`: optionally an image that contains only the random noise of the stack (half the
/// difference of two stacks made from alternate frames). The stacked image itself also contains
/// the countless stars too faint to be told apart, which no amount of stacking removes; with
/// `random` the signal-to-noise ratio is measured against the noise that stacking does reduce.
pub fn depth(lum: &[f32], random: Option<&[f32]>, valid: &[bool], w: usize, h: usize, sol: &Solution, cat: &Catalog, blobs: &[[f64; 2]]) -> Option<Depth> {
    const R: i64 = 3; // aperture radius in pixels
    let aperture_in = |img: &[f32], x: f64, y: f64| -> Option<f32> {
        let (cx, cy) = (x.round() as i64, y.round() as i64);
        if cx < R || cy < R || cx >= w as i64 - R || cy >= h as i64 - R {
            return None;
        }
        let mut sum = 0.0;
        for dy in -R..=R {
            for dx in -R..=R {
                if dx * dx + dy * dy <= R * R {
                    let k = (cy + dy) as usize * w + (cx + dx) as usize;
                    if !valid[k] {
                        return None;
                    }
                    sum += img[k];
                }
            }
        }
        Some(sum)
    };
    let aperture = |x: f64, y: f64| aperture_in(lum, x, y);
    // zero point: unsaturated catalogue stars that were detected
    let (mut zero_points, mut faint, mut faint_found) = (Vec::new(), 0, 0);
    for (dir, mag) in cat.stars.iter().filter(|s| s.1 >= 3.5) {
        let Some(p) = sol.project(dir).filter(|p| p[0] >= 0.0 && p[1] >= 0.0 && p[0] < w as f64 && p[1] < h as f64) else { continue };
        if aperture(p[0], p[1]).is_none() {
            continue;
        }
        let (k, d) = crate::nearest(p, blobs);
        let found = d < 4.0;
        if *mag >= 5.5 {
            faint += 1;
            faint_found += found as usize;
        }
        if let Some(flux) = found.then(|| aperture(blobs[k][0], blobs[k][1])).flatten().filter(|&f| f > 0.0) {
            zero_points.push(mag + 2.5 * flux.log10());
        }
    }
    if zero_points.len() < 20 {
        return None;
    }
    let zp = median(&mut zero_points.clone());
    let scatter = 1.4826 * median(&mut zero_points.iter().map(|z| (z - zp).abs()).collect::<Vec<_>>());
    // noise of the same aperture on empty sky, near the centre and near the corners
    let half_diagonal = (w as f64).hypot(h as f64) / 2.0;
    let noise = |img: &[f32], inner: f64, outer: f64| -> Option<f32> {
        let mut sums: Vec<f32> = (0..h)
            .step_by(23)
            .flat_map(|y| (0..w).step_by(23).map(move |x| (x as f64, y as f64)))
            .filter(|&(x, y)| {
                let r = (x - w as f64 / 2.0).hypot(y - h as f64 / 2.0) / half_diagonal;
                r >= inner && r < outer
            })
            .filter_map(|(x, y)| aperture_in(img, x, y))
            .collect();
        if sums.len() < 200 {
            return None;
        }
        let m = median(&mut sums);
        Some(1.4826 * median(&mut sums.iter().map(|s| (s - m).abs()).collect::<Vec<_>>()))
    };
    if std::env::var("STARSTACK_DEBUG").is_ok() {
        for (lo, hi) in [(0.0, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 0.85), (0.85, 1.01)] {
            let mut d: Vec<f32> = cat.stars.iter().filter(|s| s.1 < 6.0).filter_map(|s| sol.project(&s.0)).filter(|p| aperture(p[0], p[1]).is_some()).filter(|p| {
                let r = (p[0] - w as f64 / 2.0).hypot(p[1] - h as f64 / 2.0) / ((w as f64).hypot(h as f64) / 2.0);
                r >= lo && r < hi
            }).map(|p| crate::nearest(p, blobs).1 as f32).collect();
            if !d.is_empty() {
                let n = d.len();
                let within = d.iter().filter(|&&v| v < 3.0).count();
                eprintln!("debug: radius {lo:.2}-{hi:.2}: {n} catalogue stars (mag < 6), {within} within 3 px, median distance {:.1} px, 90th pct {:.1} px", median(&mut d.clone()), crate::img::percentile(&mut d, 90.0));
            }
        }
    }
    let list = if cat.deep.is_empty() { &cat.stars } else { &cat.deep };
    let mut completeness: Vec<(f32, usize, usize, usize)> = (0..9).map(|b| (4.0 + 0.5 * b as f32, 0, 0, 0)).collect();
    for (dir, mag) in list.iter().filter(|s| s.1 >= 4.0 && s.1 < 8.5) {
        let Some(p) = sol.project(dir).filter(|p| aperture(p[0], p[1]).is_some()) else { continue };
        let bin = &mut completeness[((mag - 4.0) / 0.5) as usize];
        bin.1 += 1;
        bin.2 += (crate::nearest(p, blobs).1 < 3.0) as usize;
        bin.3 += (crate::nearest([p[0] + 25.0, p[1] + 17.0], blobs).1 < 3.0) as usize;
    }
    // signal-to-noise ratio of stars of a fixed brightness, at the positions the catalogue gives
    let (sigma_in, sigma_out) = (noise(random.unwrap_or(lum), 0.0, 0.4)?, noise(random.unwrap_or(lum), 0.7, 1.0)?);
    let (mut snr_in, mut snr_out) = (Vec::new(), Vec::new());
    for (dir, _) in list.iter().filter(|s| s.1 >= 6.0 && s.1 < 6.5) {
        let Some(p) = sol.project(dir) else { continue };
        let Some(flux) = aperture(p[0], p[1]) else { continue };
        let r = (p[0] - w as f64 / 2.0).hypot(p[1] - h as f64 / 2.0) / half_diagonal;
        if r < 0.4 {
            snr_in.push(flux / sigma_in);
        } else if r >= 0.7 {
            snr_out.push(flux / sigma_out);
        }
    }
    let middle = |v: &mut Vec<f32>| if v.is_empty() { 0.0 } else { median(v) };
    let limit = |sigma: f32| zp - 2.5 * (5.0 * sigma).log10();
    let mut mags: Vec<f32> = blobs.iter().filter_map(|b| aperture(b[0], b[1])).filter(|&f| f > 0.0).map(|f| zp - 2.5 * f.log10()).collect();
    mags.sort_by(f32::total_cmp);
    Some(Depth {
        faint_catalogue: (faint, faint_found),
        calibration: (zero_points.len(), scatter),
        limit: (limit(noise(lum, 0.0, 0.35)?), limit(noise(lum, 0.8, 1.0)?)),
        limit_random: match random {
            Some(r) => Some((limit(noise(r, 0.0, 0.35)?), limit(noise(r, 0.8, 1.0)?))),
            None => None,
        },
        detected: (mags.len(), *mags.get(mags.len() * 19 / 20)?),
        completeness,
        snr: (middle(&mut snr_in), middle(&mut snr_out)),
        snr_stars: (snr_in.len(), snr_out.len()),
    })
}

// ------------------------------------------------------------------ drawing

const LINE_COLOR: [f32; 3] = [0.55, 0.78, 1.0];
const NAME_COLOR: [f32; 3] = [1.0, 0.93, 0.62];
const STAR_COLOR: [f32; 3] = [0.92, 0.95, 1.0];
const PLANET_COLOR: [f32; 3] = [1.0, 0.72, 0.55];

fn blend(img: &mut [f32], k: usize, color: [f32; 3], alpha: f32) {
    for c in 0..3 {
        img[3 * k + c] += (color[c] - img[3 * k + c]) * alpha;
    }
}

fn draw_segment(img: &mut [f32], w: usize, h: usize, a: [f64; 2], b: [f64; 2], width: f64, color: [f32; 3], opacity: f32) {
    let r = width / 2.0 + 1.0;
    let (x0, x1) = ((a[0].min(b[0]) - r).floor().max(0.0) as usize, (a[0].max(b[0]) + r).ceil().min(w as f64 - 1.0) as usize);
    let (y0, y1) = ((a[1].min(b[1]) - r).floor().max(0.0) as usize, (a[1].max(b[1]) + r).ceil().min(h as f64 - 1.0) as usize);
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let len2 = (dx * dx + dy * dy).max(1e-9);
    for y in y0..=y1.max(y0) {
        for x in x0..=x1.max(x0) {
            if x >= w || y >= h {
                continue;
            }
            let t = (((x as f64 - a[0]) * dx + (y as f64 - a[1]) * dy) / len2).clamp(0.0, 1.0);
            let d = (x as f64 - a[0] - t * dx).hypot(y as f64 - a[1] - t * dy);
            let cover = (width / 2.0 + 0.5 - d).clamp(0.0, 1.0) as f32;
            if cover > 0.0 {
                blend(img, y * w + x, color, cover * opacity);
            }
        }
    }
}

/// Text rendered to a coverage bitmap: (alpha, width, height).
fn render_text(font: &FontVec, text: &str, px: f32) -> (Vec<f32>, usize, usize) {
    let scale = PxScale::from(px);
    let sf = font.as_scaled(scale);
    let width: f32 = text.chars().map(|c| sf.h_advance(sf.glyph_id(c))).sum();
    let (tw, th) = (width.ceil() as usize + 2, (sf.ascent() - sf.descent()).ceil() as usize + 2);
    let mut alpha = vec![0f32; tw * th];
    let mut x = 1.0;
    for c in text.chars() {
        let id = sf.glyph_id(c);
        if let Some(outline) = font.outline_glyph(id.with_scale_and_position(scale, point(x, 1.0 + sf.ascent()))) {
            let bounds = outline.px_bounds();
            outline.draw(|gx, gy, cover| {
                let (px, py) = (bounds.min.x as i32 + gx as i32, bounds.min.y as i32 + gy as i32);
                if px >= 0 && py >= 0 && (px as usize) < tw && (py as usize) < th {
                    let a = &mut alpha[py as usize * tw + px as usize];
                    *a = a.max(cover);
                }
            });
        }
        x += sf.h_advance(id);
    }
    (alpha, tw, th)
}

/// Text drawing that stays upright after the EXIF orientation is applied to the finished image.
struct Writer<'a> {
    font: &'a FontVec,
    orientation: u32,
    w: usize,
    h: usize,
    blocked: &'a [bool],
    /// rectangles already used by labels (in upright text coordinates around the anchor)
    used: Vec<[f64; 4]>,
}

impl Writer<'_> {
    /// offset in upright text coordinates -> offset on the sensor
    fn turn(&self, tx: f64, ty: f64) -> (f64, f64) {
        match self.orientation {
            8 => (-ty, tx),
            6 => (ty, -tx),
            3 => (-tx, -ty),
            _ => (tx, ty),
        }
    }

    /// Draw `text` centred at `at` (sensor pixels) shifted by `offset` (upright text pixels).
    /// Returns false when the label would leave the frame, cover foreground or another label.
    fn write(&mut self, img: &mut [f32], text: &str, at: [f64; 2], offset: (f64, f64), px: f32, color: [f32; 3]) -> bool {
        let (alpha, tw, th) = render_text(self.font, text, px);
        let (ox, oy) = self.turn(offset.0, offset.1);
        let (cx, cy) = (at[0] + ox, at[1] + oy);
        let (hx, hy) = self.turn(tw as f64 / 2.0, th as f64 / 2.0);
        let rect = [cx - hx.abs() - 6.0, cy - hy.abs() - 6.0, cx + hx.abs() + 6.0, cy + hy.abs() + 6.0];
        if rect[0] < 30.0 || rect[1] < 30.0 || rect[2] > self.w as f64 - 30.0 || rect[3] > self.h as f64 - 30.0 {
            return false;
        }
        if self.used.iter().any(|u| rect[0] < u[2] && u[0] < rect[2] && rect[1] < u[3] && u[1] < rect[3]) {
            return false;
        }
        let corners = [(rect[0], rect[1]), (rect[2], rect[1]), (rect[0], rect[3]), (rect[2], rect[3]), (cx, cy)];
        if corners.iter().any(|c| self.blocked[c.1 as usize * self.w + c.0 as usize]) {
            return false;
        }
        self.used.push(rect);
        // dark halo first, then the text
        for (shade, spread) in [(Some(0.55f32), 2i32), (None, 0)] {
            for ty in 0..th {
                for tx in 0..tw {
                    let a = alpha[ty * tw + tx];
                    if a <= 0.0 {
                        continue;
                    }
                    let (dx, dy) = self.turn(tx as f64 - tw as f64 / 2.0, ty as f64 - th as f64 / 2.0);
                    for sy in -spread..=spread {
                        for sx in -spread..=spread {
                            let (x, y) = ((cx + dx).round() as i64 + sx as i64, (cy + dy).round() as i64 + sy as i64);
                            if x < 0 || y < 0 || x >= self.w as i64 || y >= self.h as i64 {
                                continue;
                            }
                            let k = y as usize * self.w + x as usize;
                            match shade {
                                Some(s) => blend(img, k, [0.0; 3], a * s / (2 * spread + 1) as f32),
                                None => blend(img, k, color, a * 0.92),
                            }
                        }
                    }
                }
            }
        }
        true
    }
}

fn japanese_name(id: &str) -> &'static str {
    const NAMES: [(&str, &str); 88] = [
        ("And", "アンドロメダ座"), ("Ant", "ポンプ座"), ("Aps", "ふうちょう座"), ("Aqr", "みずがめ座"), ("Aql", "わし座"), ("Ara", "さいだん座"),
        ("Ari", "おひつじ座"), ("Aur", "ぎょしゃ座"), ("Boo", "うしかい座"), ("Cae", "ちょうこくぐ座"), ("Cam", "きりん座"), ("Cnc", "かに座"),
        ("CVn", "りょうけん座"), ("CMa", "おおいぬ座"), ("CMi", "こいぬ座"), ("Cap", "やぎ座"), ("Car", "りゅうこつ座"), ("Cas", "カシオペヤ座"),
        ("Cen", "ケンタウルス座"), ("Cep", "ケフェウス座"), ("Cet", "くじら座"), ("Cha", "カメレオン座"), ("Cir", "コンパス座"), ("Col", "はと座"),
        ("Com", "かみのけ座"), ("CrA", "みなみのかんむり座"), ("CrB", "かんむり座"), ("Crv", "からす座"), ("Crt", "コップ座"), ("Cru", "みなみじゅうじ座"),
        ("Cyg", "はくちょう座"), ("Del", "いるか座"), ("Dor", "かじき座"), ("Dra", "りゅう座"), ("Equ", "こうま座"), ("Eri", "エリダヌス座"),
        ("For", "ろ座"), ("Gem", "ふたご座"), ("Gru", "つる座"), ("Her", "ヘルクレス座"), ("Hor", "とけい座"), ("Hya", "うみへび座"),
        ("Hyi", "みずへび座"), ("Ind", "インディアン座"), ("Lac", "とかげ座"), ("Leo", "しし座"), ("LMi", "こじし座"), ("Lep", "うさぎ座"),
        ("Lib", "てんびん座"), ("Lup", "おおかみ座"), ("Lyn", "やまねこ座"), ("Lyr", "こと座"), ("Men", "テーブルさん座"), ("Mic", "けんびきょう座"),
        ("Mon", "いっかくじゅう座"), ("Mus", "はえ座"), ("Nor", "じょうぎ座"), ("Oct", "はちぶんぎ座"), ("Oph", "へびつかい座"), ("Ori", "オリオン座"),
        ("Pav", "くじゃく座"), ("Peg", "ペガスス座"), ("Per", "ペルセウス座"), ("Phe", "ほうおう座"), ("Pic", "がか座"), ("Psc", "うお座"),
        ("PsA", "みなみのうお座"), ("Pup", "とも座"), ("Pyx", "らしんばん座"), ("Ret", "レチクル座"), ("Sge", "や座"), ("Sgr", "いて座"),
        ("Sco", "さそり座"), ("Scl", "ちょうこくしつ座"), ("Sct", "たて座"), ("Ser", "へび座"), ("Sex", "ろくぶんぎ座"), ("Tau", "おうし座"),
        ("Tel", "ぼうえんきょう座"), ("Tri", "さんかく座"), ("TrA", "みなみのさんかく座"), ("Tuc", "きょしちょう座"), ("UMa", "おおぐま座"), ("UMi", "こぐま座"),
        ("Vel", "ほ座"), ("Vir", "おとめ座"), ("Vol", "とびうお座"), ("Vul", "こぎつね座"),
    ];
    NAMES.iter().find(|n| n.0 == id).map_or("", |n| n.1)
}

/// Bright stars and objects that get their own label: (name, right ascension and declination in degrees).
const NAMED: [(&str, f64, f64); 13] = [
    ("ベガ", 279.23, 38.78),
    ("デネブ", 310.36, 45.28),
    ("アルタイル", 297.70, 8.87),
    ("北極星", 37.95, 89.26),
    ("カペラ", 79.17, 46.00),
    ("フォーマルハウト", 344.41, -29.62),
    ("アークトゥルス", 213.92, 19.18),
    ("アルデバラン", 68.98, 16.51),
    ("アルビレオ", 292.68, 27.96),
    ("アルフェラッツ", 2.10, 29.09),
    ("ミルファク", 51.08, 49.86),
    ("M31 アンドロメダ銀河", 10.685, 41.269),
    ("二重星団", 34.75, 57.13),
];

fn load_font() -> Option<FontVec> {
    let dir = std::env::var("WINDIR").map_or("C:\\Windows".into(), |d| d) + "\\Fonts\\";
    ["YuGothM.ttc", "meiryo.ttc", "YuGothR.ttc", "msgothic.ttc", "BIZ-UDGothicR.ttc"]
        .iter()
        .chain(["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc"].iter())
        .find_map(|name| {
            let path = if name.starts_with('/') { name.to_string() } else { format!("{dir}{name}") };
            FontVec::try_from_vec_and_index(std::fs::read(path).ok()?, 0).ok()
        })
}

/// Draw constellation lines and names onto a sensor-oriented RGB image.
/// `blocked` marks pixels where nothing should be written (foreground); `planets` are extra
/// labels at given pixel positions.
pub fn draw(img: &mut [f32], w: usize, h: usize, sol: &Solution, cat: &Catalog, blocked: &[bool], orientation: u32, planets: &[(&str, [f64; 2])]) {
    let size = w.max(h) as f64;
    let line_width = (size / 2000.0).max(1.5);
    let gap = size / 260.0; // keep the lines clear of the stars they connect
    let inside = |p: &[f64; 2]| p[0] >= 0.0 && p[1] >= 0.0 && p[0] < w as f64 && p[1] < h as f64;
    let mut labels: Vec<(&str, [f64; 2])> = Vec::new();
    for (id, strips) in &cat.lines {
        let (mut sum, mut visible, mut total) = ([0.0; 2], 0usize, 0usize);
        for strip in strips {
            for v in strip {
                total += 1;
                if let Some(p) = sol.project(v).filter(inside) {
                    sum = [sum[0] + p[0], sum[1] + p[1]];
                    visible += 1;
                }
            }
            for pair in strip.windows(2) {
                // follow the great circle between the two stars in small steps
                let steps = ((pair[0].dot(&pair[1]).clamp(-1.0, 1.0).acos().to_degrees() / 1.5).ceil() as usize).max(1);
                let pts: Vec<Option<[f64; 2]>> = (0..=steps).map(|s| sol.project(&pair[0].lerp(&pair[1], s as f64 / steps as f64).normalize())).collect();
                let Some(pts) = pts.into_iter().collect::<Option<Vec<[f64; 2]>>>() else { continue };
                let length: f64 = pts.windows(2).map(|s| crate::dist(s[0], s[1])).sum();
                let mut walked = 0.0;
                for s in pts.windows(2) {
                    let l = crate::dist(s[0], s[1]).max(1e-9);
                    let (t0, t1) = (((gap - walked) / l).clamp(0.0, 1.0), ((length - gap - walked) / l).clamp(0.0, 1.0));
                    walked += l;
                    if t1 > t0 {
                        let at = |t: f64| [s[0][0] + (s[1][0] - s[0][0]) * t, s[0][1] + (s[1][1] - s[0][1]) * t];
                        draw_segment(img, w, h, at(t0), at(t1), line_width, LINE_COLOR, 0.55);
                    }
                }
            }
        }
        // name the constellation when a fair part of its figure is in the frame
        if visible >= 2 && visible * 5 >= total * 2 {
            labels.push((japanese_name(id), [sum[0] / visible as f64, sum[1] / visible as f64]));
        }
    }
    let Some(font) = load_font() else {
        eprintln!("warning: no Japanese font found, names are not written");
        return;
    };
    let mut writer = Writer { font: &font, orientation, w, h, blocked, used: Vec::new() };
    let star_px = (size / 95.0) as f32;
    for &(name, p) in planets {
        let text_w = render_text(&font, name, star_px * 1.15).1 as f64;
        let _ = writer.write(img, name, p, (text_w / 2.0 + size / 150.0, size / 220.0), star_px * 1.15, PLANET_COLOR)
            || writer.write(img, name, p, (-text_w / 2.0 - size / 150.0, size / 220.0), star_px * 1.15, PLANET_COLOR);
    }
    for (name, ra, dec) in NAMED {
        // snap to the catalogue star at that place (extended objects keep their own position)
        let target = unit(ra, dec);
        let dir = cat.stars.iter().filter(|s| s.1 < 4.0 && s.0.dot(&target) > 0.5f64.to_radians().cos()).map(|s| s.0).next().unwrap_or(target);
        if let Some(p) = sol.project(&dir).filter(inside) {
            let text_w = render_text(&font, name, star_px).1 as f64;
            let _ = writer.write(img, name, p, (text_w / 2.0 + size / 170.0, size / 220.0), star_px, STAR_COLOR)
                || writer.write(img, name, p, (-text_w / 2.0 - size / 170.0, size / 220.0), star_px, STAR_COLOR);
        }
    }
    let name_px = (size / 68.0) as f32;
    for (name, at) in labels {
        // try the middle of the figure first, then nearby places
        let step = name_px as f64 * 1.3;
        let _ = [(0.0, 0.0), (0.0, -step), (0.0, step), (0.0, -2.0 * step), (0.0, 2.0 * step), (step * 3.0, 0.0), (-step * 3.0, 0.0)]
            .iter()
            .any(|&o| writer.write(img, name, at, o, name_px, NAME_COLOR));
    }
}
