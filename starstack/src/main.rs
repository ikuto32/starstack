//! Star-aligned stacking of fixed-tripod DNG frames.
//!
//! The camera is fixed, so the stars drift between frames while the foreground stays put.
//!   1. temporal sigma-clipped mean of the raw frames -> static scene (sky glow, foreground, hot pixels)
//!   2. find the foreground (anything that is not smooth sky) in the static scene
//!   3. subtract the static scene from every frame -> stars only
//!   4. detect stars, track them frame to frame, fit a polynomial warp to the reference frame;
//!      frames with too few stars (clouds) are left out of the stack
//!   5. warp + average of the star-only frames -> first star model
//!   6. redo the static scene with the star model removed from every frame, and split the slowly
//!      drifting diffuse sky (Milky Way) from the truly static part at low resolution
//!   7. final sigma-clipped stack, tone mapping, and three renderings:
//!        stacked           star-aligned sky + sharp foreground
//!        stacked_sky_only  star-aligned sky, foreground not composited
//!        star_trails       stars left where each frame recorded them + sharp foreground
//!
//! usage: starstack [raw_dir] [output_dir] [dark_frame_dir] [--flat-sky] [--no-gain-map] [--no-distortion]
//!
//! --catalog=DIR    star catalogue for the annotated image (default: ./catalog), containing the
//!                  d3-celestial files stars.6.json and constellations.lines.json. With it,
//!                  stacked_annotated (constellation lines and names) is written as well.
//! --2x             also write stacked_2x: the star-aligned image at twice the resolution, built
//!                  by drizzling the raw pixels onto a finer grid. Needs about 15 GB more memory.
//! --without=LIST   switch off individual parts of the stacking, to measure what each one
//!                  contributes: drizzle, hotmask, noiseprofile, robust, weights, localhot,
//!                  clipdark (comma separated, or "all" for the earlier method)
//! --pixfrac=X      side of a drizzle drop as a fraction of a pixel (default 0.7)
//! --cpu           do the stacking on the CPU even when a graphics card is available
//! --metrics-only   stop after the measurements; no images are written. In this mode the
//!                  random noise is measured from two stacks of alternate frames, and the
//!                  signal-to-noise ratio of magnitude 6.0-6.5 stars is reported against it.
//! --no-distortion  do not apply the lens distortion correction (WarpRectilinear) stored in the
//!                  DNG files to the finished images.
//!
//! --no-gain-map  do not apply the lens shading correction (GainMap) stored in the DNG files.
//!                The correction evens out star brightness and colour across the frame, but it
//!                multiplies the corners (and their noise) by up to ~4.
//!
//! --flat-sky  remove everything smoother than ~150 px from every frame. Use it when stray light
//!             changes during the sequence (lights switched on and off, dew on the lens); the
//!             price is that the diffuse glow of the Milky Way is removed as well.

mod annotate;
mod dng;
mod gpu;
mod img;

use img::*;
use nalgebra::DMatrix;
use rayon::prelude::*;
use std::path::{Path, PathBuf};
use std::time::Instant;

const MIN_FRAMES: f32 = 12.0; // sky pixels covered by fewer frames are shown as plain background
const BG_LEVEL: f32 = 0.075; // displayed sky background brightness (0..1)
const BG_TINT: [f32; 3] = [0.80, 0.95, 1.25];
const STAR_SATURATION: f32 = 1.6;
const FG_WHITE: f32 = 0.55; // displayed brightness of the brightest part of the foreground
const CROP: usize = 24; // without distortion correction: 8 px DNG margin + 16 px of poorly covered border
const BIN: usize = 8; // resolution reduction for the diffuse / static separation
const MAX_PAD: usize = 800;

// ------------------------------------------------------------------ least squares helpers

/// Solve the normal equations for samples (terms, value).
fn least_squares<const K: usize>(samples: impl Iterator<Item = ([f64; K], f64)>) -> [f64; K] {
    let mut ata = DMatrix::<f64>::zeros(K, K);
    let mut atb = DMatrix::<f64>::zeros(K, 1);
    for (t, v) in samples {
        for a in 0..K {
            atb[(a, 0)] += t[a] * v;
            for b in a..K {
                ata[(a, b)] += t[a] * t[b];
            }
        }
    }
    for a in 0..K {
        for b in 0..a {
            ata[(a, b)] = ata[(b, a)];
        }
    }
    let sol = ata.svd(true, true).solve(&atb, 1e-12).expect("least squares failed");
    std::array::from_fn(|k| sol[(k, 0)])
}

#[inline]
fn quad_terms(u: f64, v: f64) -> [f64; 6] {
    [1.0, u, v, u * u, u * v, v * v]
}

#[inline]
fn surface_terms(u: f64, v: f64) -> [f64; 28] {
    let mut t = [0.0; 28];
    let mut n = 0;
    for i in 0..=6 {
        for j in 0..=6 - i {
            t[n] = u.powi(i) * v.powi(j);
            n += 1;
        }
    }
    t
}

// ------------------------------------------------------------------ polynomial warp

#[derive(Clone)]
struct Poly {
    order: usize,
    cx: Vec<f64>,
    cy: Vec<f64>,
    w: f64,
    h: f64,
}

impl Poly {
    fn terms(w: f64, h: f64, x: f64, y: f64, order: usize, out: &mut Vec<f64>) {
        let (u, v) = ((x - w / 2.0) / (w / 2.0), (y - h / 2.0) / (w / 2.0));
        out.clear();
        for i in 0..=order {
            for j in 0..=order - i {
                out.push(u.powi(i as i32) * v.powi(j as i32));
            }
        }
    }

    fn identity(w: usize, h: usize) -> Poly {
        let (w, h) = (w as f64, h as f64);
        Poly { order: 1, cx: vec![w / 2.0, 0.0, w / 2.0], cy: vec![h / 2.0, w / 2.0, 0.0], w, h }
    }

    fn fit(w: f64, h: f64, src: &[[f64; 2]], dst: &[[f64; 2]], order: usize) -> Poly {
        let mut t = Vec::new();
        Poly::terms(w, h, 0.0, 0.0, order, &mut t);
        let m = t.len();
        let mut a = DMatrix::<f64>::zeros(src.len(), m);
        let mut b = DMatrix::<f64>::zeros(src.len(), 2);
        for (r, (s, d)) in src.iter().zip(dst).enumerate() {
            Poly::terms(w, h, s[0], s[1], order, &mut t);
            for (c, v) in t.iter().enumerate() {
                a[(r, c)] = *v;
            }
            b[(r, 0)] = d[0];
            b[(r, 1)] = d[1];
        }
        let sol = a.svd(true, true).solve(&b, 1e-12).expect("least squares failed");
        Poly { order, cx: sol.column(0).iter().copied().collect(), cy: sol.column(1).iter().copied().collect(), w, h }
    }

    fn eval(&self, p: [f64; 2]) -> [f64; 2] {
        let (ax, ay) = self.row(p[1]);
        let u = (p[0] - self.w / 2.0) / (self.w / 2.0);
        [horner(&ax, u), horner(&ay, u)]
    }

    /// For a fixed y the warp is a polynomial in x: returns its coefficients.
    fn row(&self, y: f64) -> ([f64; 5], [f64; 5]) {
        let v = (y - self.h / 2.0) / (self.w / 2.0);
        let (mut ax, mut ay) = ([0.0; 5], [0.0; 5]);
        let mut n = 0;
        for i in 0..=self.order {
            for j in 0..=self.order - i {
                let p = v.powi(j as i32);
                ax[i] += self.cx[n] * p;
                ay[i] += self.cy[n] * p;
                n += 1;
            }
        }
        (ax, ay)
    }

    /// Calls `f(x, y, mapped_x, mapped_y)` for every pixel of a w x h grid whose origin is at `origin`.
    fn for_each(&self, w: usize, h: usize, origin: f64, mut f: impl FnMut(usize, usize, f64, f64)) {
        for y in 0..h {
            let (ax, ay) = self.row(y as f64 + origin);
            for x in 0..w {
                let u = (x as f64 + origin - self.w / 2.0) / (self.w / 2.0);
                f(x, y, horner(&ax, u), horner(&ay, u));
            }
        }
    }
}

#[inline]
fn horner(a: &[f64; 5], u: f64) -> f64 {
    (((a[4] * u + a[3]) * u + a[2]) * u + a[1]) * u + a[0]
}

// ------------------------------------------------------------------ shared state

struct Ctx {
    w: usize,
    h: usize,
    frames: Vec<Vec<u16>>,
    black: f32,
    hot: Vec<bool>,
    /// 1 where the sky is unobstructed (foreground mask with a safety margin removed)
    sky: Vec<u8>,
    /// per Bayer plane: a subsample of sky pixels (index, u, v) used to level each frame
    level_samples: [Vec<(usize, f64, f64)>; 4],
    /// also remove everything smoother than ~150 px from every frame (see `--flat-sky`)
    flat_sky: bool,
    /// lens shading correction factor per pixel (all 1 when not used)
    gain: Vec<f32>,
}

impl Ctx {
    /// Frame i with the static scene removed: stars (and noise) only, as a Bayer mosaic.
    /// A smooth quadratic surface is removed per colour plane, which takes care of slow changes
    /// of the sky brightness and of stray light from the foreground.
    ///
    /// `glow` is an optional low-resolution RGB pattern (stray light that follows the brightness
    /// of the foreground lighting) together with its amplitude in this frame.
    ///
    /// The lens shading correction is applied here, except for star detection (`shading: false`),
    /// which works better on data whose noise is the same everywhere.
    fn star_frame(&self, i: usize, stat: &[f32], glow: Option<(&[f32], f32)>, shading: bool) -> Vec<f32> {
        let (w, h) = (self.w, self.h);
        let mut d: Vec<f32> = self.frames[i].iter().zip(stat).map(|(&r, &s)| r as f32 - self.black - s).collect();
        if shading {
            d.iter_mut().zip(&self.gain).for_each(|(v, g)| *v *= g);
        }
        if let Some((pattern, amount)) = glow {
            let (ws, hs) = (w / BIN, h / BIN);
            for y in 0..h {
                for x in 0..w {
                    let (sx, sy) = ((x as f32 + 0.5) / BIN as f32 - 0.5, (y as f32 + 0.5) / BIN as f32 - 0.5);
                    d[y * w + x] -= amount * sample_clamped(pattern, ws, hs, 3, cfa_channel(x, y), sx, sy);
                }
            }
        }
        d.iter_mut().zip(&self.hot).for_each(|(v, &hot)| {
            if hot {
                *v = 0.0
            }
        });
        for (plane, samples) in self.level_samples.iter().enumerate() {
            let mut c = [0.0; 6];
            let mut limit = f64::MAX;
            for _ in 0..3 {
                let resid = |s: &(usize, f64, f64)| d[s.0] as f64 - quad_terms(s.1, s.2).iter().zip(&c).map(|(t, c)| t * c).sum::<f64>();
                c = least_squares(samples.iter().filter(|s| resid(s).abs() < limit).map(|s| (quad_terms(s.1, s.2), d[s.0] as f64)));
                let resid = |s: &(usize, f64, f64)| d[s.0] as f64 - quad_terms(s.1, s.2).iter().zip(&c).map(|(t, c)| t * c).sum::<f64>();
                let mut dev: Vec<f32> = samples.iter().map(|s| resid(s).abs() as f32).collect();
                limit = 3.0 * 1.4826 * median(&mut dev) as f64;
            }
            let (dy, dx) = (plane / 2, plane % 2);
            for y in (dy..h).step_by(2) {
                let v = (y as f64 - h as f64 / 2.0) / (w as f64 / 2.0);
                let (a0, a1, a2) = (c[0] + c[2] * v + c[5] * v * v, c[1] + c[4] * v, c[3]);
                for x in (dx..w).step_by(2) {
                    let u = (x as f64 - w as f64 / 2.0) / (w as f64 / 2.0);
                    d[y * w + x] -= (a0 + (a1 + a2 * u) * u) as f32;
                }
            }
            if self.flat_sky {
                // background of this plane on a coarse grid: block medians over the sky pixels
                const BLOCK: usize = 32;
                let (pw, ph) = (w / 2, h / 2);
                let (gw, gh) = (pw.div_ceil(BLOCK), ph.div_ceil(BLOCK));
                let mut grid = vec![f32::NAN; gw * gh];
                let mut buf = Vec::new();
                for (g, cell) in grid.iter_mut().enumerate() {
                    buf.clear();
                    for py in (g / gw * BLOCK..(g / gw * BLOCK + BLOCK).min(ph)).step_by(2) {
                        for px in (g % gw * BLOCK..(g % gw * BLOCK + BLOCK).min(pw)).step_by(2) {
                            let k = (2 * py + dy) * w + 2 * px + dx;
                            if self.sky[k] != 0 {
                                buf.push(d[k]);
                            }
                        }
                    }
                    if buf.len() >= 40 {
                        *cell = median(&mut buf);
                    }
                }
                // fill the blocks without sky from their neighbours, then smooth
                while grid.iter().any(|v| v.is_nan()) {
                    let prev = grid.clone();
                    for g in (0..gw * gh).filter(|&g| prev[g].is_nan()) {
                        let (gx, gy) = ((g % gw) as isize, (g / gw) as isize);
                        let near: Vec<f32> = [(-1, 0), (1, 0), (0, -1), (0, 1)]
                            .iter()
                            .map(|(ox, oy)| (gx + ox, gy + oy))
                            .filter(|&(x, y)| x >= 0 && y >= 0 && x < gw as isize && y < gh as isize)
                            .map(|(x, y)| prev[y as usize * gw + x as usize])
                            .filter(|v| !v.is_nan())
                            .collect();
                        if !near.is_empty() {
                            grid[g] = near.iter().sum::<f32>() / near.len() as f32;
                        }
                    }
                    if grid.iter().all(|v| v.is_nan()) {
                        grid.fill(0.0);
                    }
                }
                let grid = blur(&median5(&grid, gw, gh), gw, gh, 1, 1.0);
                for py in 0..ph {
                    for px in 0..pw {
                        let (bx, by) = ((px as f32 + 0.5) / BLOCK as f32 - 0.5, (py as f32 + 0.5) / BLOCK as f32 - 0.5);
                        d[(2 * py + dy) * w + 2 * px + dx] -= sample_clamped(&grid, gw, gh, 1, 0, bx, by);
                    }
                }
            }
        }
        d
    }

    /// Warp a star-only RGB frame onto the canvas (the frame enlarged by `pad` on every side),
    /// calling `f(canvas_index, rgb)` for every canvas pixel that sees unobstructed sky in this frame.
    fn warp_each(&self, rgb: &[f32], poly: &Poly, pad: usize, mut f: impl FnMut(usize, [f32; 3])) {
        let (w, h) = (self.w, self.h);
        let cw = w + 2 * pad;
        poly.for_each(cw, h + 2 * pad, -(pad as f64), |cx, cy, sx, sy| {
            if !(sx >= 1.0 && sy >= 1.0 && sx < (w - 2) as f64 && sy < (h - 2) as f64) {
                return;
            }
            let (x0, y0) = (sx as usize, sy as usize);
            let i = y0 * w + x0;
            if self.sky[i] & self.sky[i + 1] & self.sky[i + w] & self.sky[i + w + 1] == 0 {
                return;
            }
            let (wx, wy) = (cubic((sx - x0 as f64) as f32), cubic((sy - y0 as f64) as f32));
            let mut px = [0f32; 3];
            for (j, wyj) in wy.iter().enumerate() {
                let base = ((y0 + j - 1) * w + x0 - 1) * 3;
                for (k, wxk) in wx.iter().enumerate() {
                    let wgt = wyj * wxk;
                    px[0] += wgt * rgb[base + 3 * k];
                    px[1] += wgt * rgb[base + 3 * k + 1];
                    px[2] += wgt * rgb[base + 3 * k + 2];
                }
            }
            f(cy * cw + cx, px);
        });
    }
}

/// Bicubic interpolation weights (a = -0.75) for taps at -1, 0, 1, 2.
#[inline]
fn cubic(t: f32) -> [f32; 4] {
    const A: f32 = -0.75;
    let w0 = ((A * (t + 1.0) - 5.0 * A) * (t + 1.0) + 8.0 * A) * (t + 1.0) - 4.0 * A;
    let w1 = ((A + 2.0) * t - (A + 3.0)) * t * t + 1.0;
    let w2 = ((A + 2.0) * (1.0 - t) - (A + 3.0)) * (1.0 - t) * (1.0 - t) + 1.0;
    [w0, w1, w2, 1.0 - w0 - w1 - w2]
}

/// Run `f(acc, item)` for all items on all cores, each worker with its own accumulator, then merge.
fn par_accumulate<A: Send>(items: &[usize], init: impl Fn() -> A + Sync, f: impl Fn(&mut A, usize) + Sync, merge: impl Fn(&mut A, A) + Sync) -> A {
    par_accumulate_capped(items, usize::MAX, init, f, merge)
}

/// Same with at most `workers` accumulators alive at a time (for very large accumulators).
fn par_accumulate_capped<A: Send>(items: &[usize], workers: usize, init: impl Fn() -> A + Sync, f: impl Fn(&mut A, usize) + Sync, merge: impl Fn(&mut A, A) + Sync) -> A {
    let t = rayon::current_num_threads().min(items.len()).min(workers).max(1);
    (0..t)
        .into_par_iter()
        .map(|g| {
            let mut a = init();
            items.iter().skip(g).step_by(t).for_each(|&i| f(&mut a, i));
            a
        })
        .reduce_with(|mut a, b| {
            merge(&mut a, b);
            a
        })
        .unwrap()
}

/// Drizzle: spread a drop centred at (xc, yc) with half-size `half` over the output pixels it
/// overlaps, calling `f(pixel index, overlap area)`.
#[inline]
fn splat(xc: f64, yc: f64, half: f64, w: usize, h: usize, mut f: impl FnMut(usize, f32)) {
    let (x0, x1) = ((xc - half + 0.5).floor().max(0.0) as usize, ((xc + half + 0.5).floor() as usize).min(w - 1));
    let (y0, y1) = ((yc - half + 0.5).floor().max(0.0) as usize, ((yc + half + 0.5).floor() as usize).min(h - 1));
    for y in y0..=y1 {
        let oy = ((yc + half).min(y as f64 + 0.5) - (yc - half).max(y as f64 - 0.5)).max(0.0);
        for x in x0..=x1 {
            let ox = ((xc + half).min(x as f64 + 0.5) - (xc - half).max(x as f64 - 0.5)).max(0.0);
            if ox * oy > 0.0 {
                f(y * w + x, (ox * oy) as f32);
            }
        }
    }
}

fn add(a: &mut [f32], b: &[f32]) {
    a.iter_mut().zip(b).for_each(|(x, y)| *x += y);
}

/// Per-pixel median over a set of frames, and the median absolute deviation from it.
fn temporal_median(frames: &[&[u16]]) -> (Vec<f32>, Vec<f32>) {
    let n = frames.len();
    (0..frames[0].len())
        .into_par_iter()
        .map_init(
            || (vec![0u16; n], vec![0f32; n]),
            |(buf, dev), k| {
                frames.iter().zip(buf.iter_mut()).for_each(|(f, b)| *b = f[k]);
                buf.sort_unstable();
                let med = (buf[(n - 1) / 2] as f32 + buf[n / 2] as f32) / 2.0;
                buf.iter().zip(dev.iter_mut()).for_each(|(&b, d)| *d = (b as f32 - med).abs());
                (med, median(dev))
            },
        )
        .unzip()
}

/// Per-pixel mean of the values that lie within `clip` of `centre` (raw units).
fn clipped_mean(frames: &[&[u16]], centre: &[f32], clip: &[f32]) -> Vec<f32> {
    (0..centre.len())
        .into_par_iter()
        .map(|k| {
            let (mut sum, mut cnt) = (0f32, 0u32);
            for f in frames {
                if (f[k] as f32 - centre[k]).abs() < clip[k] {
                    sum += f[k] as f32;
                    cnt += 1;
                }
            }
            if cnt > 0 { sum / cnt as f32 } else { centre[k] }
        })
        .collect()
}

/// The individual improvements of the stacking, each of which can be switched off with
/// `--without=name,name,...` to measure what it contributes.
#[derive(Clone, Copy, Debug)]
struct Features {
    /// stack the raw Bayer samples directly (drizzle) instead of demosaic + bicubic resampling
    drizzle: bool,
    /// treat hot and saturated pixels as missing data instead of as zeros
    hotmask: bool,
    /// noise model from the DNG NoiseProfile instead of a fit to the frames
    noiseprofile: bool,
    /// outlier rejection in several rounds, with thresholds from the predicted noise
    robust: bool,
    /// inverse-variance weights per sample and per frame (lens shading, noisy pixels, transparency)
    weights: bool,
    /// hot pixels in the dark frames judged against the local dark level
    localhot: bool,
    /// master dark as a sigma-clipped mean instead of a median
    clipdark: bool,
}

impl Features {
    const NAMES: [&'static str; 7] = ["drizzle", "hotmask", "noiseprofile", "robust", "weights", "localhot", "clipdark"];

    fn parse(without: &str) -> Features {
        let off = |name: &str| without.split(',').any(|w| w == name || w == "all");
        for w in without.split(',').filter(|w| !w.is_empty() && *w != "all" && !Self::NAMES.contains(w)) {
            panic!("unknown feature '{w}' (known: {})", Self::NAMES.join(", "));
        }
        // weights, masks and the robust rejection live in the drizzle engine
        let drizzle = !off("drizzle");
        Features {
            drizzle,
            hotmask: drizzle && !off("hotmask"),
            noiseprofile: !off("noiseprofile"),
            robust: drizzle && !off("robust"),
            weights: drizzle && !off("weights"),
            localhot: !off("localhot"),
            clipdark: !off("clipdark"),
        }
    }

    fn list(&self) -> String {
        let on = [self.drizzle, self.hotmask, self.noiseprofile, self.robust, self.weights, self.localhot, self.clipdark];
        let names: Vec<&str> = Self::NAMES.iter().zip(on).filter(|(_, o)| *o).map(|(n, _)| *n).collect();
        if names.is_empty() { "none".into() } else { names.join("+") }
    }
}

/// Result of a drizzle stack on a grid `scale` times finer than the frames.
struct Stack {
    /// weighted mean per pixel and colour (camera RGB)
    rgb: Vec<f32>,
    /// summed drop area per pixel: the smallest of the three colours
    cover: Vec<f32>,
    /// fraction of the samples that the outlier rejection removed
    rejected: f64,
}

/// Prepared frames (value and weight per pixel) kept in memory between the passes of the GPU
/// stack, as far as the memory budget allows; the rest is prepared again in every pass.
struct FrameCache {
    limit: usize,
    frames: std::sync::Mutex<std::collections::HashMap<usize, std::sync::Arc<Vec<f32>>>>,
}

impl FrameCache {
    /// Room for as many frames as fit into a third of the memory that is free right now.
    fn new(w: usize, h: usize) -> FrameCache {
        let mut system = sysinfo::System::new();
        system.refresh_memory();
        FrameCache { limit: (system.available_memory() / 3 / (8 * w * h) as u64) as usize, frames: Default::default() }
    }
}

struct DrizzleJob<'a> {
    ctx: &'a Ctx,
    /// frames to stack
    frames: &'a [usize],
    /// warp frame -> reference coordinates, per frame
    inv: &'a [Option<Poly>],
    /// warp reference -> frame coordinates, per frame (used by the GPU version)
    fwd: &'a [Option<Poly>],
    /// graphics card to run the accumulation on; `None` = CPU
    gpu: Option<&'a gpu::Gpu>,
    cache: Option<&'a FrameCache>,
    /// star-only Bayer frame
    cfa: &'a (dyn Fn(usize) -> Vec<f32> + Sync),
    /// per frame: factor that brings the frame to the common brightness scale (1 / transparency)
    norm: &'a (dyn Fn(usize) -> f32 + Sync),
    /// inverse variance of sample (frame, pixel) on the common scale; `None` = all samples equal
    weight: Option<&'a (dyn Fn(usize, usize) -> f32 + Sync)>,
    /// output pixels per frame pixel
    scale: usize,
    /// side of a drop as a fraction of a frame pixel
    pixfrac: f64,
    /// border around the reference frame, in frame pixels
    pad: usize,
    /// 1 = plain mean, 2 = one round of outlier rejection, 3 = two rounds
    passes: usize,
    /// leave out hot and saturated pixels instead of using their values
    mask_bad: bool,
    white: u16,
    workers: usize,
}

/// Bayer drizzle: every raw sample is dropped, shrunk to 0.7 of a pixel, onto the output grid
/// at the place the star field was at in its frame, into the plane of its own colour. There is
/// no demosaicing and no resampling, so the noise of the samples stays independent and each
/// sample can carry its own weight.
fn drizzle(job: &DrizzleJob) -> Stack {
    let (w, h, ctx) = (job.ctx.w, job.ctx.h, job.ctx);
    let (ow, oh) = (job.scale * (w + 2 * job.pad), job.scale * (h + 2 * job.pad));
    let on = ow * oh;
    let half = job.pixfrac / 2.0 * job.scale as f64;
    // calls f(colour, value, inverse variance, x, y) for every usable sample of frame i
    let samples = |i: usize, f: &mut dyn FnMut(usize, f32, f32, f64, f64)| {
        let (d, norm) = ((job.cfa)(i), (job.norm)(i));
        job.inv[i].as_ref().unwrap().for_each(w, h, 0.0, |x, y, rx, ry| {
            let k = y * w + x;
            if ctx.sky[k] == 0 || (job.mask_bad && (ctx.hot[k] || ctx.frames[i][k] >= job.white)) {
                return;
            }
            let (xc, yc) = (job.scale as f64 * (rx + job.pad as f64 + 0.5) - 0.5, job.scale as f64 * (ry + job.pad as f64 + 0.5) - 0.5);
            if xc > -1.0 && yc > -1.0 && xc < ow as f64 && yc < oh as f64 {
                f(cfa_channel(x, y), d[k] * norm, job.weight.map_or(1.0, |wt| wt(i, k)), xc, yc);
            }
        });
    };
    // per pixel and colour: sum of weights, of weight * value, of weight * value^2, and of drop area
    type Acc = [Vec<f32>; 4];
    // mean and the spread allowed around it, from the previous pass
    let mut previous: Option<(Vec<f32>, Vec<f32>)> = None;
    let (mut cover, mut first_total) = (Vec::new(), 0f64);
    // (value, weight) per sensor pixel of frame i, weight 0 = no data: the input of the GPU version
    let prepare = |i: usize| -> std::sync::Arc<Vec<f32>> {
        if let Some(hit) = job.cache.and_then(|c| c.frames.lock().unwrap().get(&i).cloned()) {
            return hit;
        }
        let (d, norm) = ((job.cfa)(i), (job.norm)(i));
        let mut out = vec![0f32; 2 * w * h];
        for k in 0..w * h {
            if ctx.sky[k] != 0 && !(job.mask_bad && (ctx.hot[k] || ctx.frames[i][k] >= job.white)) {
                out[2 * k] = d[k] * norm;
                out[2 * k + 1] = job.weight.map_or(1.0, |wt| wt(i, k));
            }
        }
        let out = std::sync::Arc::new(out);
        if let Some(c) = job.cache {
            let mut frames = c.frames.lock().unwrap();
            if frames.len() < c.limit {
                frames.insert(i, out.clone());
            }
        }
        out
    };
    let gpu = job.gpu.filter(|g| g.fits(ow, oh, w, h));
    for pass in 0..job.passes {
        let acc: Acc = if let Some(g) = gpu {
            g.accumulate(&gpu::Job {
                w,
                h,
                ow,
                oh,
                scale: job.scale as f32,
                pad: job.pad as f32,
                half: half as f32,
                radius: (job.pixfrac / 2.0 + 0.5 / job.scale as f64 + 0.65) as u32,
                phase: bayer_phase(),
                weighted: job.weight.is_some(),
                frames: job.frames,
                fwd: job.fwd,
                inv: job.inv,
                prepare: &prepare,
                previous: previous.as_ref().map(|p| (&p.0[..], &p.1[..])),
            })
        } else {
            par_accumulate_capped(
            job.frames,
            job.workers,
            || std::array::from_fn(|_| vec![0f32; 3 * on]),
            |acc: &mut Acc, i| {
                samples(i, &mut |c, v, wt, xc, yc| {
                    if let Some((mean, spread)) = &previous {
                        let k = 3 * ((yc.round().clamp(0.0, oh as f64 - 1.0) as usize) * ow + xc.round().clamp(0.0, ow as f64 - 1.0) as usize) + c;
                        // the sample's own predicted variance plus what the pixel shows on top of
                        // that (a star that falls differently on the pixels in every frame)
                        let allowed = if job.weight.is_some() { 1.0 / wt + spread[k] } else { spread[k] };
                        if (v - mean[k]).powi(2) >= 12.25 * allowed {
                            return;
                        }
                    }
                    splat(xc, yc, half, ow, oh, |k, area| {
                        let o = area * wt;
                        acc[0][3 * k + c] += o;
                        acc[1][3 * k + c] += o * v;
                        acc[2][3 * k + c] += o * v * v;
                        acc[3][3 * k + c] += area;
                    })
                });
            },
            |a, b| a.iter_mut().zip(&b).for_each(|(x, y)| add(x, y)),
        )
        };
        let mean: Vec<f32> = (0..3 * on).into_par_iter().map(|k| if acc[0][k] > 0.0 { acc[1][k] / acc[0][k] } else { previous.as_ref().map_or(0.0, |p| p.0[k]) }).collect();
        let total: f64 = acc[3].par_iter().map(|&v| v as f64).sum();
        if pass == 0 {
            first_total = total;
            cover = acc[3].par_chunks_exact(3).map(|p| p[0].min(p[1]).min(p[2])).collect();
        }
        if pass + 1 < job.passes {
            let variance = |k: usize| if acc[0][k] > 0.0 { (acc[2][k] / acc[0][k] - mean[k] * mean[k]).max(0.0) } else { 0.0 };
            let spread: Vec<f32> = if job.weight.is_some() {
                // weighted variance minus what the predicted noise alone explains
                (0..3 * on).into_par_iter().map(|k| if acc[0][k] > 0.0 { (variance(k) - acc[3][k] / acc[0][k]).max(0.0) } else { 0.0 }).collect()
            } else {
                // sample variance, not below the typical value of the colour
                let mut floor = [0f32; 3];
                for (c, f) in floor.iter_mut().enumerate() {
                    let mut v: Vec<f32> = (oh / 3..2 * oh / 3).step_by(7).flat_map(|y| (ow / 4..3 * ow / 4).step_by(7).map(move |x| 3 * (y * ow + x) + c)).filter(|&k| acc[3][k] > 1.0).map(variance).collect();
                    *f = if v.is_empty() { 0.0 } else { median(&mut v) };
                }
                (0..3 * on).into_par_iter().map(|k| variance(k).max(floor[k % 3])).collect()
            };
            previous = Some((mean, spread));
        } else {
            return Stack { rgb: mean, cover, rejected: 1.0 - total / first_total.max(1.0) };
        }
    }
    unreachable!()
}

fn load_dir(dir: &Path) -> Vec<dng::Dng> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("dng")))
        .collect();
    files.sort();
    files.par_iter().map(|f| dng::read(f).unwrap_or_else(|e| panic!("{e}"))).collect()
}

// ------------------------------------------------------------------ foreground

/// Find everything that is not sky in the static scene: fit a smooth surface to the sky
/// (robustly, so that the foreground does not pull it) and mark what deviates from it.
/// Returns (foreground, unobstructed sky with a safety margin).
fn foreground_mask(static_rgb: &[f32], w: usize, h: usize, dn: f32) -> (Vec<bool>, Vec<u8>) {
    let lum: Vec<f32> = static_rgb.chunks_exact(3).map(|p| p[0] + p[1] + p[2]).collect();
    let lum = blur(&lum, w, h, 1, 0.8);
    const B: usize = 16;
    let (sw, sh) = (w / B, h / B);
    let small = bin(&lum, w, h, 1, B);
    let coords = |k: usize| (((k % sw) as f64 - sw as f64 / 2.0) / (sw as f64 / 2.0), ((k / sw) as f64 - sh as f64 / 2.0) / (sw as f64 / 2.0));
    let typical = median(&mut small.clone());
    let mut keep: Vec<bool> = small.iter().map(|&v| v > 0.5 * typical && v < 1.5 * typical).collect();
    let mut model = vec![0f32; sw * sh];
    for _ in 0..8 {
        let c = least_squares((0..sw * sh).filter(|&k| keep[k]).map(|k| (surface_terms(coords(k).0, coords(k).1), small[k] as f64)));
        for k in 0..sw * sh {
            model[k] = surface_terms(coords(k).0, coords(k).1).iter().zip(&c).map(|(t, c)| t * c).sum::<f64>() as f32;
        }
        let mut dev: Vec<f32> = (0..sw * sh).filter(|&k| keep[k]).map(|k| (small[k] - model[k]).abs()).collect();
        let limit = (2.5 * 1.4826 * median(&mut dev)).max(0.01 * typical);
        keep = (0..sw * sh).map(|k| (small[k] - model[k]).abs() < limit).collect();
    }
    let mut fg: Vec<u8> = (0..w * h)
        .into_par_iter()
        .map(|i| {
            let m = sample_clamped(&model, sw, sh, 1, 0, ((i % w) as f32 + 0.5) / B as f32 - 0.5, ((i / w) as f32 + 0.5) / B as f32 - 0.5);
            let dev = (lum[i] - m).abs();
            (dev > 0.12 * m.max(0.0) + 0.5 * dn) as u8 + (dev > 0.35 * m.max(0.0) + dn) as u8
        })
        .collect();
    // weak deviations only count as part of an object that also deviates clearly somewhere,
    // so that a slightly imperfect sky model (corners) is not mistaken for foreground
    let strong: Vec<bool> = fg.iter().map(|&v| v == 2).collect();
    fg.iter_mut().for_each(|v| *v = (*v > 0) as u8);
    // remove isolated specks (and thin wires), then close the gaps inside the objects
    fg = morph(&morph(&fg, w, h, 5, false), w, h, 5, true);
    fg = morph(&morph(&fg, w, h, 25, true), w, h, 25, false);
    // the sky is the largest connected region that is left; everything else is foreground
    let (label, sizes) = components(&fg.iter().map(|&v| v == 0).collect::<Vec<_>>(), w, h);
    let sky_label = (1..sizes.len()).max_by_key(|&l| sizes[l]).expect("no sky found") as u32;
    fg = label.iter().map(|&l| (l != sky_label) as u8).collect();
    // keep only solid objects of some size
    fg = morph(&morph(&fg, w, h, 15, false), w, h, 15, true);
    let (label, sizes) = components(&fg.iter().map(|&v| v != 0).collect::<Vec<_>>(), w, h);
    let mut strong_px = vec![0usize; sizes.len()];
    label.iter().zip(&strong).for_each(|(&l, &s)| strong_px[l as usize] += s as usize);
    fg = label.iter().map(|&l| (l != 0 && sizes[l as usize] >= w * h / 5000 && strong_px[l as usize] * 20 >= sizes[l as usize]) as u8).collect();
    let foreground = morph(&fg, w, h, 3, true).iter().map(|&v| v != 0).collect();
    let sky = morph(&fg, w, h, 31, true).iter().map(|&v| (v == 0) as u8).collect();
    (foreground, sky)
}

// ------------------------------------------------------------------ stars

/// Star centroids and brightness (x, y, flux) in full-resolution pixels from a star-only Bayer frame.
fn detect_stars(d: &[f32], w: usize, h: usize, sky: &[u8]) -> Vec<[f64; 3]> {
    let (hw, hh) = (w / 2, h / 2);
    let mut b = vec![0f32; hw * hh];
    for y in 0..hh {
        for x in 0..hw {
            let i = 2 * y * w + 2 * x;
            b[y * hw + x] = d[i] + d[i + 1] + d[i + w] + d[i + w + 1];
        }
    }
    let s = blur(&b, hw, hh, 1, 1.2);
    let is_sky = |k: usize| sky[2 * (k / hw) * w + 2 * (k % hw)] != 0;
    let mut dev: Vec<f32> = (0..hw * hh).filter(|&k| is_sky(k)).step_by(7).map(|k| s[k].abs()).collect();
    let thr = 5.0 * 1.4826 * median(&mut dev);
    let mut seen = vec![false; hw * hh];
    let mut stars = Vec::new();
    let mut stack = Vec::new();
    for start in 0..hw * hh {
        if seen[start] || s[start] <= thr || !is_sky(start) {
            continue;
        }
        seen[start] = true;
        stack.push(start);
        let (mut flux, mut sx, mut sy, mut area) = (0f64, 0f64, 0f64, 0);
        while let Some(k) = stack.pop() {
            let (x, y) = ((k % hw) as isize, (k / hw) as isize);
            let v = s[k] as f64;
            flux += v;
            sx += v * x as f64;
            sy += v * y as f64;
            area += 1;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    let (xx, yy) = (x + dx, y + dy);
                    if xx < 0 || yy < 0 || xx >= hw as isize || yy >= hh as isize {
                        continue;
                    }
                    let j = yy as usize * hw + xx as usize;
                    if !seen[j] && s[j] > thr && is_sky(j) {
                        seen[j] = true;
                        stack.push(j);
                    }
                }
            }
        }
        if (3..=400).contains(&area) {
            stars.push([sx / flux * 2.0 + 0.5, sy / flux * 2.0 + 0.5, flux]);
        }
    }
    stars
}

/// Stars in a finished (background-free) luminance image, brightest first. `sigma` is the
/// smoothing applied before the search; out-of-focus stars need a larger value to come out
/// as one object each. Stars are the local maxima of the smoothed image, so that neighbours
/// in a crowded field stay separate objects.
fn detect_blobs(lum: &[f32], valid: &[bool], w: usize, h: usize, sigma: f32) -> Vec<[f64; 2]> {
    let s = blur(lum, w, h, 1, sigma);
    let mut dev: Vec<f32> = (0..w * h).filter(|&k| valid[k]).step_by(11).map(|k| s[k].abs()).collect();
    let thr = 6.0 * 1.4826 * median(&mut dev);
    let r = (1.5 * sigma).round().max(2.0) as usize;
    let mut stars: Vec<[f64; 3]> = (r..h - r)
        .into_par_iter()
        .flat_map_iter(|y| {
            let s = &s;
            (r..w - r).filter_map(move |x| {
                let v = s[y * w + x];
                if v <= thr || !valid[y * w + x] {
                    return None;
                }
                // the brightest pixel of its neighbourhood (ties go to the first in scan order)
                let (mut sum, mut sx, mut sy, mut low) = (0f64, 0f64, 0f64, f32::MAX);
                for yy in y - r..=y + r {
                    for xx in x - r..=x + r {
                        let n = s[yy * w + xx];
                        if n > v || (n == v && (yy, xx) < (y, x)) {
                            return None;
                        }
                        low = low.min(n);
                    }
                }
                // centroid of the neighbourhood above its faintest pixel
                for yy in y - r..=y + r {
                    for xx in x - r..=x + r {
                        let n = (s[yy * w + xx] - low) as f64;
                        sum += n;
                        sx += n * xx as f64;
                        sy += n * yy as f64;
                    }
                }
                (sum > 0.0).then(|| [sx / sum, sy / sum, v as f64])
            })
        })
        .collect();
    stars.sort_by(|a, b| b[2].total_cmp(&a[2]));
    stars.truncate(40000);
    stars.iter().map(|s| [s[0], s[1]]).collect()
}
fn dist(a: [f64; 2], b: [f64; 2]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

fn nearest(p: [f64; 2], set: &[[f64; 2]]) -> (usize, f64) {
    let (mut best, mut bd) = (0, f64::MAX);
    for (j, s) in set.iter().enumerate() {
        let d = dist(p, *s);
        if d < bd {
            (best, bd) = (j, d);
        }
    }
    (best, bd)
}

struct Match {
    forward: Poly,
    inverse: Poly,
    /// (catalogue index, star index)
    pairs: Vec<(usize, usize)>,
    rms: f64,
}

/// Fit the warp catalogue -> frame (and its inverse). `pred` is where the catalogue stars are
/// expected in this frame, extrapolated from the neighbouring frames.
fn match_and_fit(w: usize, h: usize, cat: &[[f64; 2]], stars: &[[f64; 2]], mut pred: Vec<[f64; 2]>) -> Option<Match> {
    const MIN_MATCHES: usize = 12;
    if stars.len() < MIN_MATCHES {
        return None;
    }
    let (w, h) = (w as f64, h as f64);
    let mut best = None;
    for radius in [6.0, 3.0, 2.0] {
        let to_star: Vec<(usize, f64)> = pred.par_iter().map(|p| nearest(*p, stars)).collect();
        let to_pred: Vec<usize> = stars.par_iter().map(|s| nearest(*s, &pred).0).collect();
        let pairs: Vec<(usize, usize)> = (0..pred.len()).filter(|&r| to_star[r].1 < radius && to_pred[to_star[r].0] == r).map(|r| (r, to_star[r].0)).collect();
        if pairs.len() < MIN_MATCHES {
            return None;
        }
        let order = match pairs.len() {
            150.. => 4,
            60.. => 3,
            25.. => 2,
            _ => 1,
        };
        let src: Vec<[f64; 2]> = pairs.iter().map(|p| cat[p.0]).collect();
        let dst: Vec<[f64; 2]> = pairs.iter().map(|p| stars[p.1]).collect();
        let mut keep = vec![true; pairs.len()];
        let pick = |v: &[[f64; 2]], keep: &[bool]| -> Vec<[f64; 2]> { v.iter().zip(keep).filter(|(_, &k)| k).map(|(p, _)| *p).collect() };
        let mut coef = Poly::identity(w as usize, h as usize);
        let mut res = Vec::new();
        for _ in 0..4 {
            coef = Poly::fit(w, h, &pick(&src, &keep), &pick(&dst, &keep), order);
            res = src.iter().zip(&dst).map(|(s, d)| dist(coef.eval(*s), *d)).collect();
            let mut kept: Vec<f32> = res.iter().zip(&keep).filter(|(_, &k)| k).map(|(r, _)| *r as f32).collect();
            let limit = (3.0 * 1.4826 * median(&mut kept) as f64).max(0.3);
            keep = res.iter().map(|&r| r < limit).collect();
            if keep.iter().filter(|&&k| k).count() < MIN_MATCHES {
                return None;
            }
        }
        pred = cat.iter().map(|c| coef.eval(*c)).collect();
        let n = keep.iter().filter(|&&k| k).count();
        let rms = (res.iter().zip(&keep).filter(|(_, &k)| k).map(|(r, _)| r * r).sum::<f64>() / n as f64).sqrt();
        let inverse = Poly::fit(w, h, &pick(&dst, &keep), &pick(&src, &keep), order);
        best = Some(Match { forward: coef, inverse, pairs: pairs.iter().zip(&keep).filter(|(_, &k)| k).map(|(p, _)| *p).collect(), rms });
    }
    best.filter(|m| m.rms < 1.5)
}

struct CatStar {
    pos: [f64; 2],
    sum: [f64; 2],
    hits: u32,
    born: i64,
    id: usize,
}

/// Track the stars outwards from the reference frame. The catalogue (in reference coordinates)
/// grows as new stars drift into view, so long sequences stay well constrained at the edges.
/// Returns per frame the warp reference -> frame, its inverse, and the matched stars as
/// (catalogue star id, index of the star in that frame's list).
#[allow(clippy::type_complexity)]
fn register(stars: &[Vec<[f64; 2]>], reference: usize, w: usize, h: usize) -> (Vec<Option<Poly>>, Vec<Option<Poly>>, Vec<Vec<(usize, usize)>>) {
    let n = stars.len();
    let ident = Poly::identity(w, h);
    let (mut fwd, mut inv, mut matches) = (vec![None; n], vec![None; n], vec![Vec::new(); n]);
    fwd[reference] = Some(ident.clone());
    inv[reference] = Some(ident.clone());
    matches[reference] = (0..stars[reference].len()).map(|j| (j, j)).collect();
    let mut cat: Vec<CatStar> = stars[reference].iter().enumerate().map(|(id, &p)| CatStar { pos: p, sum: p, hits: 1, born: reference as i64, id }).collect();
    let mut next_id = cat.len();
    for dir in [1i64, -1] {
        let mut hist: Vec<(i64, Poly)> = vec![(reference as i64, ident.clone())];
        let mut i = reference as i64 + dir;
        while i >= 0 && i < n as i64 {
            cat.retain(|c| c.hits > 1 || (i - c.born).abs() <= 6);
            let pos: Vec<[f64; 2]> = cat.iter().map(|c| c.pos).collect();
            let (i1, p1) = hist.last().unwrap();
            // the drift is extrapolated from an earlier frame some distance back, which gives a
            // steadier rate than the immediate neighbour
            let earlier = hist.iter().rev().skip(1).find(|e| (i1 - e.0).abs() >= 8).or(hist.len().checked_sub(2).map(|k| &hist[k]));
            let pred: Vec<[f64; 2]> = pos
                .iter()
                .map(|&r| {
                    let a = p1.eval(r);
                    match earlier {
                        Some((i0, p0)) => {
                            let (b, t) = (p0.eval(r), (i - i1) as f64 / (i1 - i0) as f64);
                            [a[0] + (a[0] - b[0]) * t, a[1] + (a[1] - b[1]) * t]
                        }
                        None => a,
                    }
                })
                .collect();
            let frame = &stars[i as usize];
            // After a gap (clouds) the prediction can be off by more than the matching radius:
            // then find the shift that most predicted positions and stars agree on, and retry.
            let retry = || {
                const REACH: f64 = 120.0;
                const CELL: f64 = 6.0;
                let cells = (2.0 * REACH / CELL) as usize + 1;
                if frame.len() < 30 {
                    return None;
                }
                let votes = pred
                    .par_iter()
                    .filter(|p| p[0] > -REACH && p[1] > -REACH && p[0] < w as f64 + REACH && p[1] < h as f64 + REACH)
                    .fold(
                        || vec![0u32; cells * cells],
                        |mut v, p| {
                            for s in frame {
                                let (dx, dy) = (s[0] - p[0], s[1] - p[1]);
                                if dx.abs() < REACH && dy.abs() < REACH {
                                    v[((dy + REACH) / CELL) as usize * cells + ((dx + REACH) / CELL) as usize] += 1;
                                }
                            }
                            v
                        },
                    )
                    .reduce(|| vec![0u32; cells * cells], |mut a, b| {
                        a.iter_mut().zip(&b).for_each(|(x, y)| *x += y);
                        a
                    });
                let (best, &count) = votes.iter().enumerate().max_by_key(|v| *v.1)?;
                let mut sorted = votes.clone();
                sorted.sort_unstable();
                if count < 15 || count < 4 * sorted[sorted.len() / 2].max(1) {
                    return None;
                }
                let (ox, oy) = ((best % cells) as f64 * CELL - REACH + CELL / 2.0, (best / cells) as f64 * CELL - REACH + CELL / 2.0);
                match_and_fit(w, h, &pos, frame, pred.iter().map(|p| [p[0] + ox, p[1] + oy]).collect())
            };
            if let Some(m) = match_and_fit(w, h, &pos, frame, pred.clone()).or_else(retry) {
                let mut used = vec![false; frame.len()];
                for &(r, j) in &m.pairs {
                    let q = m.inverse.eval(frame[j]);
                    let c = &mut cat[r];
                    c.sum = [c.sum[0] + q[0], c.sum[1] + q[1]];
                    c.hits += 1;
                    c.pos = [c.sum[0] / c.hits as f64, c.sum[1] / c.hits as f64];
                    used[j] = true;
                }
                if m.pairs.len() >= 40 {
                    for (j, s) in frame.iter().enumerate() {
                        let q = m.inverse.eval(*s);
                        if !used[j] && nearest(q, &pos).1 > 4.0 {
                            cat.push(CatStar { pos: q, sum: q, hits: 1, born: i, id: next_id });
                            next_id += 1;
                        }
                    }
                }
                matches[i as usize] = m.pairs.iter().map(|&(r, j)| (cat[r].id, j)).collect();
                hist.push((i, m.forward.clone()));
                fwd[i as usize] = Some(m.forward);
                inv[i as usize] = Some(m.inverse);
            }
            i += dir;
        }
    }
    (fwd, inv, matches)
}

// ------------------------------------------------------------------ rendering

fn srgb_gamma(x: f32) -> f32 {
    let x = x.clamp(0.0, 1.0);
    if x < 0.0031308 { 12.92 * x } else { 1.055 * x.powf(1.0 / 2.4) - 0.055 }
}

/// Tone-map a background-free linear image of the sky (asinh stretch, colour only where there is signal).
fn tone_sky(s: &mut [f32], valid: &[bool], w: usize, h: usize) -> Vec<f32> {
    for c in 0..3 {
        let mut v: Vec<f32> = (0..w * h).filter(|&i| valid[i]).step_by(13).map(|i| s[3 * i + c]).collect();
        let m = median(&mut v);
        s.iter_mut().skip(c).step_by(3).for_each(|x| *x -= m);
    }
    let mut lum: Vec<f32> = s.chunks_exact(3).map(|p| 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]).collect();
    let mut dev: Vec<f32> = (0..w * h).filter(|&i| valid[i]).step_by(13).map(|i| lum[i].abs()).collect();
    let sigma = 1.4826 * median(&mut dev);
    let mut top: Vec<f32> = (0..w * h).filter(|&i| valid[i]).step_by(3).map(|i| lum[i]).collect();
    let white = percentile(&mut top, 99.999);

    // pixels without data become plain background with matching noise
    let mut state = 0x9E3779B97F4A7C15u64;
    let mut uniform = || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        ((state >> 11) as f64 + 1.0) / (1u64 << 53) as f64
    };
    for i in (0..w * h).filter(|&i| !valid[i]) {
        let g = ((-2.0 * uniform().ln()).sqrt() * (std::f64::consts::TAU * uniform()).cos()) as f32 * sigma;
        lum[i] = g;
        s[3 * i..3 * i + 3].fill(g);
    }

    let soft = 2.5 * sigma;
    let ped = (BG_LEVEL * (white / soft).asinh()).sinh() * soft; // pedestal that lands on BG_LEVEL
    let norm = ((white + ped) / soft).asinh();
    let smooth = blur(&lum, w, h, 1, 1.5);
    let mut out = vec![0f32; 3 * w * h];
    out.par_chunks_mut(3).enumerate().for_each(|(i, o)| {
        let l = (lum[i] + ped).max(0.0);
        let out_l = ((l / soft).asinh() / norm).clamp(0.0, 1.0);
        let snr = ((smooth[i] - 3.0 * sigma) / (12.0 * sigma)).clamp(0.0, 1.0);
        for c in 0..3 {
            let ratio = 1.0 + ((s[3 * i + c] + ped) / l.max(1e-6) - 1.0) * snr * STAR_SATURATION;
            let tint = 1.0 + (BG_TINT[c] - 1.0) * (1.0 - snr) * (1.0 - 2.0 * out_l).clamp(0.0, 1.0);
            o[c] = (out_l * ratio.clamp(0.0, 4.0) * tint).clamp(0.0, 1.0);
        }
    });
    out
}

/// Undo the lens distortion as described by the DNG WarpRectilinear coefficients: every pixel of
/// the corrected image is looked up at the place where the lens actually put it.
fn undistort(img: &[f32], w: usize, h: usize, k: &[f64; 8]) -> Vec<f32> {
    let (cx, cy) = (k[6] * (w - 1) as f64, k[7] * (h - 1) as f64);
    let m = [0.0, (w - 1) as f64].iter().flat_map(|&x| [0.0, (h - 1) as f64].map(|y| ((x - cx).powi(2) + (y - cy).powi(2)).sqrt())).fold(0.0, f64::max);
    let mut out = vec![0f32; img.len()];
    out.par_chunks_mut(3 * w).enumerate().for_each(|(y, row)| {
        let dy = (y as f64 - cy) / m;
        for x in 0..w {
            let dx = (x as f64 - cx) / m;
            let r2 = dx * dx + dy * dy;
            let f = k[0] + r2 * (k[1] + r2 * (k[2] + r2 * k[3]));
            let sx = cx + m * (f * dx + k[4] * 2.0 * dx * dy + k[5] * (r2 + 2.0 * dx * dx));
            let sy = cy + m * (f * dy + k[5] * 2.0 * dx * dy + k[4] * (r2 + 2.0 * dy * dy));
            row[3 * x..3 * x + 3].copy_from_slice(&sample_cubic(img, w, h, sx as f32, sy as f32));
        }
    });
    out
}

/// Correct the lens distortion (if coefficients are given), crop the border, apply the EXIF
/// orientation and write JPEG + 16-bit TIFF.
fn save(dir: &Path, name: &str, img: &[f32], w: usize, h: usize, orientation: u32, warp: Option<&[f64; 8]>, scale: usize) {
    let corrected = warp.map(|k| undistort(img, w, h, k));
    let img = corrected.as_deref().unwrap_or(img);
    // the correction itself already drops the outermost ~15-25 px, so only the DNG margin is cropped
    let crop = scale * if warp.is_some() { 8 } else { CROP };
    let (cw, ch) = (w - 2 * crop, h - 2 * crop);
    let (ow, oh) = if matches!(orientation, 6 | 8) { (ch, cw) } else { (cw, ch) };
    let mut out = vec![0f32; 3 * ow * oh];
    for y in 0..oh {
        for x in 0..ow {
            let (sx, sy) = match orientation {
                8 => (cw - 1 - y, x),
                6 => (y, ch - 1 - x),
                3 => (cw - 1 - x, ch - 1 - y),
                _ => (x, y),
            };
            let src = ((sy + crop) * w + sx + crop) * 3;
            out[(y * ow + x) * 3..][..3].copy_from_slice(&img[src..src + 3]);
        }
    }
    let px8: Vec<u8> = out.iter().map(|v| (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u8).collect();
    let px16: Vec<u16> = out.iter().map(|v| (v.clamp(0.0, 1.0) * 65535.0 + 0.5) as u16).collect();
    let jpg = image::RgbImage::from_raw(ow as u32, oh as u32, px8).unwrap();
    let tif = image::ImageBuffer::<image::Rgb<u16>, _>::from_raw(ow as u32, oh as u32, px16).unwrap();
    // a file that is open in a viewer cannot be replaced on Windows: fall back to another name
    let write = |ext: &str, f: &dyn Fn(&Path) -> image::ImageResult<()>| {
        let path = dir.join(format!("{name}.{ext}"));
        let mut result = f(&path);
        for _ in 0..5 {
            if result.is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(400));
            result = f(&path);
        }
        if let Err(e) = result {
            let alt = dir.join(format!("{name}_new.{ext}"));
            eprintln!("warning: cannot write {} ({e}), writing {} instead", path.display(), alt.display());
            f(&alt).expect("cannot write output image");
        }
    };
    write("jpg", &|p| {
        let file = std::io::BufWriter::new(std::fs::File::create(p)?);
        jpg.write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(file, 95))
    });
    write("tif", &|p| tif.save(p));
}

// ------------------------------------------------------------------ main

fn main() {
    let flat_sky = std::env::args().any(|a| a == "--flat-sky");
    let no_gain_map = std::env::args().any(|a| a == "--no-gain-map");
    let no_distortion = std::env::args().any(|a| a == "--no-distortion");
    let double = std::env::args().any(|a| a == "--2x");
    let metrics_only = std::env::args().any(|a| a == "--metrics-only");
    let gpu = if std::env::args().any(|a| a == "--cpu") { None } else { gpu::Gpu::new() };
    let option = |name: &str| std::env::args().find_map(|a| a.strip_prefix(name).map(str::to_string));
    let features = Features::parse(&option("--without=").unwrap_or_default());
    let catalog_dir = PathBuf::from(std::env::args().find_map(|a| a.strip_prefix("--catalog=").map(str::to_string)).unwrap_or("catalog".into()));
    let args: Vec<String> = std::env::args().filter(|a| !a.starts_with("--")).collect();
    let raw_dir = PathBuf::from(args.get(1).map_or("raw_data", |s| s.as_str()));
    let out_dir = PathBuf::from(args.get(2).map_or("output", |s| s.as_str()));
    let dark_dir = args.get(3).map(PathBuf::from);
    std::fs::create_dir_all(&out_dir).expect("cannot create output directory");
    let t0 = Instant::now();
    macro_rules! log {
        ($($a:tt)*) => { println!("[{:6.1}s] {}", t0.elapsed().as_secs_f32(), format!($($a)*)) };
    }

    // ---------------------------------------------------------------- load
    let mut dngs = load_dir(&raw_dir);
    let n = dngs.len();
    assert!(n >= 8, "need at least 8 frames");
    let (w, h, black, wb, cam2srgb, orientation, focal35) = (dngs[0].w, dngs[0].h, dngs[0].black, dngs[0].wb, dngs[0].cam2srgb, dngs[0].orientation, dngs[0].focal35);
    let julian_date = dngs[n / 2].julian_date;
    let (white, noise_profile) = (dngs[0].white, dngs[0].noise);
    assert!(dngs.iter().all(|d| d.phase == dngs[0].phase), "frames differ in Bayer layout");
    set_bayer_phase(dngs[0].phase);
    // thresholds given in raw units were chosen for 10-bit data; `dn` scales them to this sensor
    let dn = (white + 1.0) / 1024.0;
    assert!(dngs.iter().all(|d| d.w == w && d.h == h), "frames differ in size");
    let frames: Vec<Vec<u16>> = dngs.iter_mut().map(|d| std::mem::take(&mut d.data)).collect();
    // Lens shading correction. The camera re-estimates the map for every shot, but the lens does
    // not change, so one map (the median over all frames) is used for the whole sequence.
    let mut gain = vec![1f32; w * h];
    let maps: Vec<&dng::GainMap> = dngs.iter().filter_map(|d| d.gain.as_ref()).collect();
    let use_gain = !no_gain_map && maps.len() == n && maps.iter().all(|m| (m.rows, m.cols) == (maps[0].rows, maps[0].cols));
    if use_gain {
        let (rows, cols) = (maps[0].rows, maps[0].cols);
        let grid: [Vec<f32>; 4] = std::array::from_fn(|p| (0..rows * cols).map(|k| median(&mut maps.iter().map(|m| m.planes[p][k]).collect::<Vec<_>>())).collect());
        gain.par_chunks_mut(w).enumerate().for_each(|(y, row)| {
            for (x, g) in row.iter_mut().enumerate() {
                let (gx, gy) = (x as f32 / w as f32 * (cols - 1) as f32, y as f32 / h as f32 * (rows - 1) as f32);
                *g = sample_clamped(&grid[(y & 1) * 2 + (x & 1)], cols, rows, 1, 0, gx, gy);
            }
        });
    }
    let max_gain = gain.iter().copied().fold(1f32, f32::max);
    // Lens distortion correction: again one set of coefficients (the median) for the sequence.
    let warps: Vec<[f64; 8]> = dngs.iter().filter_map(|d| d.warp).collect();
    let warp: Option<[f64; 8]> = (!no_distortion && warps.len() == n).then(|| {
        std::array::from_fn(|k| {
            let mut v: Vec<f64> = warps.iter().map(|c| c[k]).collect();
            v.sort_by(f64::total_cmp);
            v[n / 2]
        })
    });
    log!("loaded {n} frames, {w}x{h}, black level {black:.1}, lens shading map {}", if use_gain { format!("used (up to x{max_gain:.2} in the corners)") } else { "not used".into() });
    log!("lens distortion correction {}", if warp.is_some() { "used" } else { "not used" });
    log!("stacking runs on {}", gpu.as_ref().map_or("the CPU".to_string(), |g| g.name.clone()));

    // ---------------------------------------------------------------- static scene
    // The static scene is built from the clear frames only: those whose sky is neither brighter
    // nor more structured than usual (clouds lit from below are both).
    let sky_stats: Vec<(f32, f32)> = frames
        .par_iter()
        .map(|f| {
            let mut v: Vec<f32> = (h / 8..7 * h / 8).step_by(8).flat_map(|y| (w / 8..7 * w / 8).step_by(8).map(move |x| y * w + x)).map(|k| f[k] as f32).collect();
            let level = median(&mut v);
            (level - black, percentile(&mut v, 99.0) - level)
        })
        .collect();
    let quartile = |pick: fn(&(f32, f32)) -> f32| percentile(&mut sky_stats.iter().map(pick).collect::<Vec<_>>(), 25.0);
    let (usual_level, usual_spread) = (quartile(|s| s.0), quartile(|s| s.1));
    let mut clear: Vec<usize> = (0..n).filter(|&i| sky_stats[i].0 <= 1.3 * usual_level + 2.0 * dn && sky_stats[i].1 <= 1.6 * usual_spread + 2.0 * dn).collect();
    if clear.len() < (n / 5).max(8) {
        clear = (0..n).collect();
    }
    let clear_frames: Vec<&[u16]> = clear.iter().map(|&i| &frames[i][..]).collect();
    log!("{} of {n} frames have a clear sky and define the static scene", clear.len());
    // shot noise calibration on a patch of the frame: variance = gain * signal + read noise
    let mut ratios = Vec::new();
    for y in (h / 2..h / 2 + 200).step_by(3) {
        for x in (w / 4..3 * w / 4).step_by(3) {
            let mut v: Vec<f32> = clear_frames.iter().map(|f| f[y * w + x] as f32).collect();
            let mean = v.iter().sum::<f32>() / v.len() as f32;
            let var = v.iter().map(|a| (a - mean).powi(2)).sum::<f32>() / v.len() as f32;
            ratios.push(var / (median(&mut v) - black).max(1.0));
        }
    }
    let noise_gain = median(&mut ratios);
    // noise model in raw units: variance = shot * signal + read. Preferably the calibration that
    // the camera wrote into the file (plus the quantisation noise), otherwise the fit from above.
    let (shot, read) = match noise_profile.filter(|_| features.noiseprofile) {
        Some((s, r)) => (s, r + 1.0 / 12.0),
        None => (noise_gain, 1.0),
    };
    let raw_variance = move |level: f32| shot * (level - black).max(if features.noiseprofile { 0.0 } else { 1.0 }) + read;
    let (median_img, mad_img) = temporal_median(&clear_frames);
    let clip: Vec<f32> = median_img.iter().map(|&m| 2.5 * raw_variance(m).sqrt() + 1.0).collect();
    let mut stat: Vec<f32> = clipped_mean(&clear_frames, &median_img, &clip).iter().map(|v| v - black).collect();
    drop(clear_frames);
    log!("static scene done (noise: variance = {shot:.3} x signal + {read:.2}; fitted coefficient {noise_gain:.3})");

    // hot pixels: much brighter than the same-colour neighbourhood in the static scene
    let mut hot = vec![false; w * h];
    let mut stat_fixed = stat.clone();
    // 5 x 5 median within each colour plane, back on the full grid
    let plane_median = |img: &[f32]| -> Vec<f32> {
        let mut out = vec![0f32; w * h];
        for plane in 0..4 {
            let (dy, dx) = (plane / 2, plane % 2);
            let p: Vec<f32> = (0..h / 2).flat_map(|y| (0..w / 2).map(move |x| (2 * y + dy) * w + 2 * x + dx)).map(|i| img[i]).collect();
            for (k, &m) in median5(&p, w / 2, h / 2).iter().enumerate() {
                out[(2 * (k / (w / 2)) + dy) * w + 2 * (k % (w / 2)) + dx] = m;
            }
        }
        out
    };
    // optional dark frames: a direct measurement of the hot pixels and of the sensor's dark pattern
    if let Some(dir) = &dark_dir {
        let phase = dngs[0].phase;
        let darks: Vec<Vec<u16>> = load_dir(dir).into_iter().filter(|d| d.w == w && d.h == h && d.phase == phase).map(|d| d.data).collect();
        if darks.len() >= 3 {
            let dark_refs: Vec<&[u16]> = darks.iter().map(|d| &d[..]).collect();
            let (dark_median, _) = temporal_median(&dark_refs);
            // the median is 1.57 times noisier than a mean, so average what survives a clip around it
            let dark = if features.clipdark {
                let clip: Vec<f32> = dark_median.iter().map(|&m| 2.5 * raw_variance(m).sqrt() + 1.0).collect();
                clipped_mean(&dark_refs, &dark_median, &clip)
            } else {
                dark_median
            };
            let level = median(&mut dark.iter().step_by(17).copied().collect::<Vec<_>>());
            if features.localhot {
                // against the local dark level, so that smooth structure such as amplifier glow
                // is not taken for hot pixels
                let local = plane_median(&dark);
                let mut dev: Vec<f32> = (0..w * h).step_by(17).map(|k| (dark[k] - local[k]).abs()).collect();
                let sigma = (1.4826 * median(&mut dev)).max((read / darks.len() as f32).sqrt());
                let limit = 6.0 * sigma + 3.0 * dn;
                (0..w * h).for_each(|k| hot[k] = dark[k] - local[k] > limit);
            } else {
                let mut dev: Vec<f32> = dark.iter().step_by(17).map(|v| (v - level).abs()).collect();
                let sigma = 1.4826 * median(&mut dev);
                (0..w * h).for_each(|k| hot[k] = dark[k] - level > 6.0 * sigma + 3.0 * dn);
            }
            (0..w * h).for_each(|k| stat_fixed[k] -= dark[k] - level);
            log!("dark frames: {} used, {} hot pixels", darks.len(), hot.iter().filter(|&&v| v).count());
        } else {
            log!("dark frames: not enough matching frames in {}, ignored", dir.display());
        }
    }
    for plane in 0..4 {
        let (dy, dx) = (plane / 2, plane % 2);
        let p: Vec<f32> = (0..h / 2).flat_map(|y| (0..w / 2).map(move |x| (2 * y + dy) * w + 2 * x + dx)).map(|i| stat_fixed[i]).collect();
        let nb = median5(&p, w / 2, h / 2);
        for (k, (&v, &m)) in p.iter().zip(&nb).enumerate() {
            let i = (2 * (k / (w / 2)) + dy) * w + 2 * (k % (w / 2)) + dx;
            if hot[i] || v - m > 0.15 * m.max(1.0) + 3.0 * dn {
                hot[i] = true;
                stat_fixed[i] = m;
            }
        }
    }
    // the foreground is found before the lens shading correction: the uncorrected sky is the
    // smoother of the two, which makes the foreground stand out more reliably
    let (foreground, sky) = foreground_mask(&demosaic(&stat_fixed, w, h, true), w, h, dn);
    stat_fixed.iter_mut().zip(&gain).for_each(|(s, g)| *s *= g);
    let static_rgb = demosaic(&stat_fixed, w, h, true);
    drop(stat_fixed);
    log!("hot pixels: {}", hot.iter().filter(|&&v| v).count());

    // ---------------------------------------------------------------- foreground

    let fg_share = foreground.iter().filter(|&&b| b).count() as f32 / (w * h) as f32;
    log!("foreground covers {:.1}% of the frame", 100.0 * fg_share);
    assert!(fg_share < 0.7, "could not separate sky and foreground");

    let level_samples = [0, 1, 2, 3].map(|plane| {
        let (dy, dx) = (plane / 2, plane % 2);
        (dy..h)
            .step_by(2)
            .flat_map(|y| (dx..w).step_by(2).map(move |x| y * w + x))
            .filter(|&i| sky[i] != 0)
            .step_by(101)
            .map(|i| (i, ((i % w) as f64 - w as f64 / 2.0) / (w as f64 / 2.0), ((i / w) as f64 - h as f64 / 2.0) / (w as f64 / 2.0)))
            .collect()
    });
    // brightness of the foreground in every frame (lights being switched on and off ...)
    let fg_samples: Vec<usize> = (0..w * h).filter(|&k| foreground[k]).step_by(7).collect();
    let light: Vec<f32> = frames.par_iter().map(|f| fg_samples.iter().map(|&k| f[k] as f32 - black).sum::<f32>() / fg_samples.len().max(1) as f32).collect();
    let ctx = Ctx { w, h, frames, black, hot, sky, level_samples, flat_sky, gain };

    // ---------------------------------------------------------------- registration
    let detected: Vec<Vec<[f64; 3]>> = (0..n).into_par_iter().map(|i| detect_stars(&ctx.star_frame(i, &stat, None, false), w, h, &ctx.sky)).collect();
    let stars: Vec<Vec<[f64; 2]>> = detected.iter().map(|f| f.iter().map(|s| [s[0], s[1]]).collect()).collect();
    // reference: the frame with the most stars in the middle third of the sequence
    let reference = (n / 3..=2 * n / 3).max_by_key(|&i| stars[i].len()).unwrap();
    let mut counts: Vec<usize> = stars.iter().map(|s| s.len()).collect();
    counts.sort();
    log!("stars per frame: min {} median {} max {}, reference frame {reference} ({})", counts[0], counts[n / 2], counts[n - 1], stars[reference].len());
    let (fwd_polys, inv_polys, observed) = register(&stars, reference, w, h);
    let registered: Vec<usize> = (0..n).filter(|&i| fwd_polys[i].is_some()).collect();
    let matches: Vec<usize> = observed.iter().map(|o| o.len()).collect();
    let mut sorted: Vec<usize> = registered.iter().map(|&i| matches[i]).collect();
    sorted.sort();
    let typical = sorted[sorted.len() / 2];
    // frames that kept most of their stars: used wherever all frames count the same
    let good: Vec<usize> = registered.iter().copied().filter(|&i| matches[i] * 5 >= typical * 2).collect();
    let ng = good.len();
    assert!(ng >= 8, "too few frames could be aligned");

    // Transparency of every frame: how bright its stars are compared with the same stars in
    // the other frames (thin cloud, haze, dew). Only the brighter stars are used, measured after
    // the lens shading correction so that their drift across the frame does not matter.
    let mut transparency = vec![1f32; n];
    {
        let mut by_star: std::collections::HashMap<usize, Vec<(usize, f32)>> = std::collections::HashMap::new();
        for &i in &registered {
            for &(id, j) in &observed[i] {
                let s = detected[i][j];
                let g = ctx.gain[(s[1] as usize).min(h - 1) * w + (s[0] as usize).min(w - 1)];
                by_star.entry(id).or_default().push((i, s[2] as f32 * g));
            }
        }
        // typical brightness of every star that was seen in at least a third of the frames
        let mut typical_flux: Vec<(usize, f32)> = by_star.iter().filter(|(_, o)| o.len() * 3 >= registered.len()).map(|(&id, o)| (id, median(&mut o.iter().map(|v| v.1).collect::<Vec<_>>()))).collect();
        typical_flux.sort_by(|a, b| b.1.total_cmp(&a.1));
        typical_flux.truncate((typical_flux.len() * 3 / 10).max(20));
        let mut ratios = vec![Vec::new(); n];
        for (id, flux) in &typical_flux {
            by_star[id].iter().for_each(|&(i, f)| ratios[i].push(f / flux));
        }
        for &i in &registered {
            if ratios[i].len() >= 5 {
                transparency[i] = median(&mut ratios[i]);
            } else if i != reference {
                transparency[i] = 0.0; // none of the brighter stars found: treat as opaque
            }
        }
        let scale = median(&mut good.iter().map(|&i| transparency[i]).collect::<Vec<_>>()).max(1e-3);
        transparency.iter_mut().for_each(|t| *t = (*t / scale).min(1.5));
    }
    // Frames that lost most of their stars stay out even when the frames are weighted: measured
    // on the cloudy end of a sequence, letting them in with low weights made the result worse.
    let stack_frames: Vec<usize> = good.clone();
    let mut t_sorted: Vec<f32> = registered.iter().map(|&i| transparency[i]).collect();
    t_sorted.sort_by(f32::total_cmp);
    log!(
        "registration: {} of {n} frames aligned, {} used for stacking (typically {typical} matched stars; transparency {:.2} to {:.2})",
        registered.len(),
        stack_frames.len(),
        t_sorted[0],
        t_sorted[t_sorted.len() - 1]
    );
    if std::env::var("STARSTACK_DEBUG").is_ok() {
        // where the centre of the reference frame lies in every frame, and which frames are missing
        let mut line = String::new();
        for i in 0..n {
            match &fwd_polys[i] {
                Some(p) => {
                    let c = p.eval([w as f64 / 2.0, h as f64 / 2.0]);
                    line += &format!("{i}:({:.0},{:.0},m{},t{:.2}) ", c[0] - w as f64 / 2.0, c[1] - h as f64 / 2.0, matches[i], transparency[i]);
                }
                None => line += &format!("{i}:- "),
            }
        }
        eprintln!("debug frames: {line}");
    }
    if let Some(dir) = option("--dump=").map(PathBuf::from) {
        // Intermediate data for illustrations: a few frames before and after the static scene is
        // removed, and everything the registration found. All in sensor coordinates (not rotated).
        std::fs::create_dir_all(&dir).expect("cannot create dump directory");
        let crop: Vec<usize> = option("--dump-crop=").map(|v| v.split(',').filter_map(|s| s.parse().ok()).collect()).unwrap_or_default();
        let (x0, y0, dw, dh) = match crop[..] {
            [x, y, cw, ch] if cw > 0 && ch > 0 && x + cw <= w && y + ch <= h => (x, y, cw, ch),
            _ => (0, 0, w, h),
        };
        let in_crop = |x: f64, y: f64| x >= x0 as f64 && y >= y0 as f64 && x < (x0 + dw) as f64 && y < (y0 + dh) as f64;
        let crop_values = |bayer: &[f32]| -> Vec<f32> { (y0..y0 + dh).step_by(3).flat_map(|y| (x0..x0 + dw).step_by(3).map(move |x| y * w + x)).map(|k| bayer[k]).collect() };
        // the crop as white-balanced camera RGB, displayed with a gamma between `lo` and `hi`
        let write = |name: &str, bayer: &[f32], lo: f32, hi: f32| {
            let rgb = demosaic(bayer, w, h, false);
            let px: Vec<u8> = (y0..y0 + dh)
                .flat_map(|y| (x0..x0 + dw).map(move |x| (y * w + x) * 3))
                .flat_map(|k| [0, 1, 2].map(|c| (((rgb[k + c] * wb[c] - lo) / (hi - lo)).clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0 + 0.5) as u8))
                .collect();
            let file = std::io::BufWriter::new(std::fs::File::create(dir.join(format!("{name}.jpg"))).expect("cannot write dump image"));
            image::RgbImage::from_raw(dw as u32, dh as u32, px).unwrap().write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(file, 95)).expect("cannot write dump image");
        };
        // one brightness scale for the raw frames and the static scene: the sky sits at a third
        let hi = 3.0 * median(&mut crop_values(&stat)).max(1.0);
        write("static", &stat, 0.0, hi);
        let cloudiest = (0..n).max_by(|&a, &b| sky_stats[a].0.total_cmp(&sky_stats[b].0)).unwrap();
        for i in [reference, cloudiest] {
            let raw: Vec<f32> = ctx.frames[i].iter().map(|&v| v as f32 - black).collect();
            write(&format!("frame{i:04}_raw"), &raw, 0.0, hi);
            // without any brightening: the full range of the sensor
            write(&format!("frame{i:04}_asshot"), &raw, 0.0, white - black);
            let stars_only = ctx.star_frame(i, &stat, None, true);
            write(&format!("frame{i:04}_stars"), &stars_only, 0.0, hi);
            let sigma = 1.4826 * median(&mut crop_values(&stars_only).iter().map(|v| v.abs()).collect::<Vec<_>>());
            write(&format!("frame{i:04}_stars_stretched"), &stars_only, -3.0 * sigma, 40.0 * sigma);
        }
        let round = |v: f64| (v * 10.0).round() / 10.0;
        let centre = [w as f64 / 2.0, h as f64 / 2.0];
        let per_frame: Vec<serde_json::Value> = (0..n)
            .map(|i| {
                let poly = fwd_polys[i].as_ref();
                // where the centre and a coarse grid of the reference frame lie in this frame
                let offset = poly.map(|p| p.eval(centre)).map(|c| [round(c[0] - centre[0]), round(c[1] - centre[1])]);
                let grid = poly.map(|p| (0..=6).flat_map(|gy| (0..=8).map(move |gx| [gx as f64 / 8.0 * w as f64, gy as f64 / 6.0 * h as f64])).map(|q| p.eval(q).map(round)).collect::<Vec<_>>());
                serde_json::json!({
                    "sky": sky_stats[i].0,
                    "clear": clear.contains(&i),
                    "used": good.contains(&i),
                    "matches": matches[i],
                    "transparency": transparency[i],
                    "offset": offset,
                    "grid": grid,
                    "stars": detected[i].iter().map(|s| [round(s[0]), round(s[1]), s[2].round()]).collect::<Vec<_>>(),
                    // (star number in the catalogue that grows during tracking, index into "stars")
                    "matched": observed[i].iter().map(|&(id, j)| [id, j]).collect::<Vec<_>>(),
                })
            })
            .collect();
        // single pixels over time: a star of the reference frame passes over each of them
        let mut bright: Vec<[f64; 3]> = detected[reference].iter().copied().filter(|s| in_crop(s[0], s[1])).collect();
        bright.sort_by(|a, b| b[2].total_cmp(&a[2]));
        let series: Vec<serde_json::Value> = [5, 30, 100]
            .iter()
            .filter_map(|&rank| bright.get(rank))
            .map(|s| {
                let (x, y) = ((s[0] as usize).min(w - 1), (s[1] as usize).min(h - 1));
                let k = y * w + x;
                serde_json::json!({ "x": x, "y": y, "static": stat[k], "hot": ctx.hot[k], "values": ctx.frames.iter().map(|f| f[k] as f32 - black).collect::<Vec<_>>() })
            })
            .collect();
        let hot_list: Vec<[usize; 2]> = (y0..y0 + dh).flat_map(|y| (x0..x0 + dw).map(move |x| [x, y])).filter(|p| ctx.hot[p[1] * w + p[0]]).take(20000).collect();
        let gain_grid: Vec<Vec<f32>> = (0..=24).map(|gy| (0..=32).map(|gx| ctx.gain[(gy * (h - 2) / 24 & !1) * w + (gx * (w - 2) / 32 & !1)]).collect()).collect();
        let dump = serde_json::json!({
            "width": w, "height": h, "orientation": orientation, "black": black, "white": white,
            "noise": { "shot": shot, "read": read },
            "crop": [x0, y0, dw, dh],
            "reference": reference, "cloudiest": cloudiest,
            "gain_grid": gain_grid,
            "hot_count": ctx.hot.iter().filter(|&&v| v).count(), "hot": hot_list,
            "series": series,
            "frames": per_frame,
        });
        std::fs::write(dir.join("frames.json"), serde_json::to_string(&dump).unwrap()).expect("cannot write frames.json");
        log!("dump written to {}", dir.display());
    }
    let fwd =|i: usize| fwd_polys[i].as_ref().unwrap();
    let inv = |i: usize| inv_polys[i].as_ref().unwrap();

    // canvas: the frame enlarged so that everything the registered frames saw fits
    let mut reach = 0f64;
    for &i in &registered {
        for k in 0..=16 {
            let t = k as f64 / 16.0;
            for p in [[t * w as f64, 0.0], [t * w as f64, h as f64], [0.0, t * h as f64], [w as f64, t * h as f64]] {
                let q = inv(i).eval(p);
                reach = reach.max(-q[0]).max(q[0] - w as f64).max(-q[1]).max(q[1] - h as f64);
            }
        }
    }
    let pad = (((reach.max(0.0) as usize + 16) / 8 + 1) * 8).min(MAX_PAD);
    let (cw, ch) = (w + 2 * pad, h + 2 * pad);
    let cn = cw * ch;
    log!("sky drift up to {reach:.0} px, canvas {cw}x{ch}");

    // ---------------------------------------------------------------- first star model
    let white_limit = (white - 2.0).clamp(0.0, 65535.0) as u16;
    let pixfrac: f64 = option("--pixfrac=").and_then(|v| v.parse().ok()).unwrap_or(0.7);
    let (mut model, cnt) = if features.drizzle {
        let first = drizzle(&DrizzleJob {
            ctx: &ctx,
            frames: &good,
            inv: &inv_polys,
            fwd: &fwd_polys,
            gpu: gpu.as_ref(),
            cache: None,
            cfa: &|i| ctx.star_frame(i, &stat, None, true),
            norm: &|_| 1.0,
            weight: None,
            scale: 1,
            pixfrac,
            pad,
            passes: 1,
            mask_bad: features.hotmask,
            white: white_limit,
            workers: 16,
        });
        (first.rgb, first.cover)
    } else {
        let (mut model, cnt) = par_accumulate(
            &good,
            || (vec![0f32; 3 * cn], vec![0f32; cn]),
            |(s, c), i| {
                let rgb = demosaic(&ctx.star_frame(i, &stat, None, true), w, h, false);
                ctx.warp_each(&rgb, fwd(i), pad, |k, p| {
                    s[3 * k] += p[0];
                    s[3 * k + 1] += p[1];
                    s[3 * k + 2] += p[2];
                    c[k] += 1.0;
                });
            },
            |a, b| {
                add(&mut a.0, &b.0);
                add(&mut a.1, &b.1);
            },
        );
        model.par_chunks_mut(3).zip(&cnt).for_each(|(p, &c)| p.iter_mut().for_each(|v| *v /= c.max(1.0)));
        (model, cnt)
    };
    // keep only the significant part of the model
    let msum: Vec<f32> = model.chunks_exact(3).map(|p| p[0] + p[1] + p[2]).collect();
    let m = blur(&msum, cw, ch, 1, 1.5);
    let centre = |step: usize| (ch / 3..2 * ch / 3).step_by(step).flat_map(move |y| (cw / 4..3 * cw / 4).step_by(step).map(move |x| y * cw + x));
    let mut dev: Vec<f32> = centre(3).filter(|&i| cnt[i] > 0.0).map(|i| m[i].abs()).collect();
    let thr = 3.0 * 1.4826 * median(&mut dev);
    let keep: Vec<u8> = m.iter().map(|&v| (v > thr) as u8).collect();
    let keep: Vec<f32> = morph(&keep, cw, ch, 5, true).iter().map(|&v| v as f32).collect();
    let keep = blur(&keep, cw, ch, 1, 1.0);
    model.par_chunks_mut(3).zip(&keep).for_each(|(p, &k)| p.iter_mut().for_each(|v| *v *= k));
    drop((msum, m, keep, cnt));
    log!("first star model done");

    // the star model as frame i would have recorded it (Bayer mosaic)
    let model_cfa = |i: usize| -> Vec<f32> {
        let mut out = vec![0f32; w * h];
        inv(i).for_each(w, h, 0.0, |x, y, rx, ry| {
            if let Some(p) = sample::<3>(&model, cw, ch, rx + pad as f64, ry + pad as f64) {
                out[y * w + x] = p[cfa_channel(x, y)];
            }
        });
        out
    };

    // ---------------------------------------------------------------- refine the static scene
    let (acc, num) = par_accumulate(
        &good,
        || (vec![0f32; w * h], vec![0f32; w * h]),
        |(acc, num), i| {
            let mc = model_cfa(i);
            for k in 0..w * h {
                let r = ctx.frames[i][k] as f32 - mc[k] / ctx.gain[k];
                if (r - median_img[k]).abs() < clip[k] {
                    acc[k] += r;
                    num[k] += 1.0;
                }
            }
        },
        |a, b| {
            add(&mut a.0, &b.0);
            add(&mut a.1, &b.1);
        },
    );
    stat = (0..w * h).map(|k| if num[k] > 0.0 { acc[k] / num[k] } else { median_img[k] } - black).collect();
    // Predicted noise variance of every sensor pixel after the lens shading correction: the
    // noise model at the pixel's usual level, or what the pixel actually showed over the
    // sequence where that is clearly more (hot pixels, pixels with telegraph noise, glow).
    let var_px: Vec<f32> = if features.weights {
        (0..w * h)
            .into_par_iter()
            .map(|k| {
                let (model, measured) = (raw_variance(median_img[k]), (1.4826 * mad_img[k]).powi(2));
                (if measured > 3.0 * model { measured } else { model }) * ctx.gain[k] * ctx.gain[k]
            })
            .collect()
    } else {
        Vec::new()
    };
    drop((acc, num, median_img, mad_img, clip));
    log!("static scene refined");

    // Diffuse sky structure (Milky Way) also drifts with the stars, but so slowly relative to its
    // size that most of it ended up in the static scene. Separate the two at 1/BIN resolution by
    // alternating between "what moves with the stars" (diffuse) and "what stays put" (correction).
    let (ws, hs) = (w / BIN, h / BIN);
    let sn = ws * hs;
    let resid_all: Vec<Vec<f32>> = registered
        .par_iter()
        .map(|&i| {
            let (d, mc) = (ctx.star_frame(i, &stat, None, true), model_cfa(i));
            let mut out = vec![0f32; 3 * sn];
            for y in 0..h {
                for x in 0..w {
                    out[((y / BIN) * ws + x / BIN) * 3 + cfa_channel(x, y)] += d[y * w + x] - mc[y * w + x];
                }
            }
            let sites = (BIN * BIN / 4) as f32;
            out.chunks_exact_mut(3).for_each(|p| {
                p[0] /= sites;
                p[1] /= 2.0 * sites;
                p[2] /= sites;
            });
            out
        })
        .collect();
    drop(model);
    // Extra variance of a frame from structure that is neither static nor moving with the stars
    // (passing cloud): how much more its low-resolution residual scatters than in a typical frame.
    let sky_small: Vec<bool> = bin(&ctx.sky.iter().map(|&v| v as f32).collect::<Vec<_>>(), w, h, 1, BIN).iter().map(|&v| v > 0.999).collect();
    // It is kept as a low-resolution map per frame, so that a cloud only costs the frame the
    // part of the sky it covers: the squared residual, smoothed, minus what is usual at that place.
    let sky_weight: Vec<f32> = sky_small.iter().map(|&s| s as u8 as f32).collect();
    let sky_blur = blur(&sky_weight, ws, hs, 1, 2.0);
    let squared: Vec<Vec<f32>> = resid_all
        .par_iter()
        .map(|r| {
            let sq: Vec<f32> = (0..sn).map(|k| r[3 * k + 1] * r[3 * k + 1] * sky_weight[k]).collect();
            blur(&sq, ws, hs, 1, 2.0).iter().zip(&sky_blur).map(|(v, s)| v / s.max(1e-3)).collect()
        })
        .collect();
    let usual: Vec<f32> = (0..sn).into_par_iter().map(|k| median(&mut squared.iter().map(|s| s[k]).collect::<Vec<_>>())).collect();
    let mut frame_var: Vec<Vec<f32>> = vec![Vec::new(); n];
    registered.iter().zip(squared).for_each(|(&i, s)| frame_var[i] = s.iter().zip(&usual).map(|(v, u)| (v - u).max(0.0)).collect());
    let mut resid: Vec<Vec<f32>> = registered.iter().zip(resid_all).filter(|(i, _)| good.contains(i)).map(|(_, r)| r).collect();
    // Stray light: when the lighting of the foreground changes during the sequence, a glow that
    // follows it is left in the frames. Regress every low-resolution pixel against the foreground
    // brightness and remove that part.
    let mut rel: Vec<f32> = good.iter().map(|&i| light[i]).collect();
    let typical_light = median(&mut rel.clone()).max(1e-3);
    rel.iter_mut().for_each(|l| *l = *l / typical_light - 1.0);
    let mean_rel = rel.iter().sum::<f32>() / ng as f32;
    rel.iter_mut().for_each(|l| *l -= mean_rel);
    let var_rel = rel.iter().map(|l| l * l).sum::<f32>() / ng as f32;
    let mut glow = vec![0f32; 3 * sn];
    let lighting_changes = !fg_samples.is_empty() && var_rel.sqrt() > 0.03;
    if lighting_changes {
        for (r, &l) in resid.iter().zip(&rel) {
            glow.iter_mut().zip(r).for_each(|(g, v)| *g += l * v / (var_rel * ng as f32));
        }
        glow = blur(&glow, ws, hs, 3, 2.0);
        resid.par_iter_mut().zip(&rel).for_each(|(r, &l)| r.iter_mut().zip(&glow).for_each(|(v, g)| *v -= l * g));
    }
    log!("foreground brightness varies by {:.1}% rms{}", 100.0 * var_rel.sqrt(), if lighting_changes { ", stray light removed" } else { "" });
    let rel_of: std::collections::HashMap<usize, f32> = registered.iter().map(|&i| (i, light[i] / typical_light - 1.0 - mean_rel)).collect();
    let glow_of = |i: usize| lighting_changes.then(|| (&glow[..], rel_of[&i]));
    // aircraft lights etc.: clip each pixel's time series (the diffuse signal itself is far below the noise)
    let limits: Vec<(f32, f32)> = (0..3 * sn)
        .into_par_iter()
        .map(|k| {
            let mut v: Vec<f32> = resid.iter().map(|r| r[k]).collect();
            let med = median(&mut v);
            v.iter_mut().for_each(|a| *a = (*a - med).abs());
            let sig = 1.4826 * median(&mut v);
            (med - 3.0 * sig, med + 3.0 * sig)
        })
        .collect();
    resid.par_iter_mut().for_each(|r| r.iter_mut().zip(&limits).for_each(|(v, l)| *v = v.clamp(l.0, l.1)));
    let sky_s: Vec<f32> = bin(&ctx.sky.iter().map(|&v| v as f32).collect::<Vec<_>>(), w, h, 1, BIN).iter().map(|&v| (v > 0.999) as u8 as f32).collect();
    let half = (BIN as f64 - 1.0) / 2.0;
    let small_map = |p: &Poly| -> Vec<[f64; 2]> {
        (0..sn).map(|k| p.eval([(k % ws * BIN) as f64 + half, (k / ws * BIN) as f64 + half]).map(|v| (v - half) / BIN as f64)).collect()
    };
    let fwd_s: Vec<Vec<[f64; 2]>> = good.par_iter().map(|&i| small_map(fwd(i))).collect();
    let inv_s: Vec<Vec<[f64; 2]>> = good.par_iter().map(|&i| small_map(inv(i))).collect();
    // bilinear remap at low resolution; pixels that fall outside contribute nothing
    fn remap<const C: usize>(src: &[f32], ws: usize, hs: usize, map: &[[f64; 2]]) -> Vec<f32> {
        map.iter().flat_map(|m| sample::<C>(src, ws, hs, m[0], m[1]).unwrap_or([0.0; C])).collect()
    }
    let w_fwd: Vec<Vec<f32>> = fwd_s.par_iter().map(|m| remap::<1>(&sky_s, ws, hs, m).iter().map(|&v| (v > 0.999) as u8 as f32).collect()).collect();
    let mut corr = vec![0f32; 3 * sn];
    let mut diffuse = vec![0f32; 3 * sn];
    let sum_frames = |parts: Vec<(Vec<f32>, Vec<f32>)>| {
        let (mut num, mut den) = (vec![0f32; 3 * sn], vec![0f32; sn]);
        for (a, b) in &parts {
            add(&mut num, a);
            add(&mut den, b);
        }
        (num, den)
    };
    let enough = (ng / 4) as f32;
    for _ in 0..if flat_sky { 0 } else { 30 } {
        let (num, den) = sum_frames(
            (0..ng)
                .into_par_iter()
                .map(|g| {
                    let diff: Vec<f32> = resid[g].iter().zip(&corr).map(|(r, c)| r - c).collect();
                    let mut v = remap::<3>(&diff, ws, hs, &fwd_s[g]);
                    v.chunks_exact_mut(3).zip(&w_fwd[g]).for_each(|(p, &wt)| p.iter_mut().for_each(|a| *a *= wt));
                    (v, w_fwd[g].clone())
                })
                .collect(),
        );
        let dvalid: Vec<f32> = den.iter().map(|&d| (d >= enough) as u8 as f32).collect();
        for c in 0..3 {
            let mut v: Vec<f32> = (0..sn).filter(|&k| dvalid[k] > 0.0).map(|k| num[3 * k + c] / den[k]).collect();
            let med = if v.is_empty() { 0.0 } else { median(&mut v) };
            for k in 0..sn {
                diffuse[3 * k + c] = (num[3 * k + c] / den[k].max(1.0) - med) * dvalid[k];
            }
        }
        let (num, den) = sum_frames(
            (0..ng)
                .into_par_iter()
                .map(|g| {
                    let d = remap::<3>(&diffuse, ws, hs, &inv_s[g]);
                    let wt: Vec<f32> = remap::<1>(&dvalid, ws, hs, &inv_s[g]).iter().zip(&sky_s).map(|(&v, &s)| if v > 0.999 { s } else { 0.0 }).collect();
                    let v = (0..3 * sn).map(|k| (resid[g][k] - d[k]) * wt[k / 3]).collect();
                    (v, wt)
                })
                .collect(),
        );
        for k in 0..3 * sn {
            corr[k] = if den[k / 3] >= enough { num[k] / den[k / 3] } else { 0.0 };
        }
    }
    let corr_full = mosaic_from(|x, y, c| sample_clamped(&corr, ws, hs, 3, c, (x as f32 + 0.5) / BIN as f32 - 0.5, (y as f32 + 0.5) / BIN as f32 - 0.5), w, h);
    stat.iter_mut().zip(&corr_full).zip(&ctx.gain).for_each(|((s, c), g)| *s += c / g);
    drop((resid, corr_full, limits));
    log!("diffuse / static separation done");

    // ---------------------------------------------------------------- final stack
    // camera RGB -> linear sRGB
    let to_linear = |p: [f32; 3]| -> [f32; 3] {
        let q = [p[0] * wb[0], p[1] * wb[1], p[2] * wb[2]];
        cam2srgb.map(|r| r[0] * q[0] + r[1] * q[1] + r[2] * q[2])
    };
    // A sample of frame i at sensor pixel k measures (transparency x sky) with the pixel's noise
    // plus the frame's own disturbance. Divided by the transparency it estimates the sky itself,
    // with inverse variance transparency^2 / variance: that is its weight.
    let weight_of = |i: usize, k: usize| transparency[i] * transparency[i] / (var_px[k] + frame_var[i][(k / w / BIN).min(hs - 1) * ws + (k % w / BIN).min(ws - 1)]);
    let norm_of = |i: usize| if features.weights { 1.0 / transparency[i].max(1e-3) } else { 1.0 };
    let cfa_of = |i: usize| ctx.star_frame(i, &stat, glow_of(i), true);
    let frame_cache = FrameCache::new(w, h);
    let job = DrizzleJob {
        ctx: &ctx,
        frames: &stack_frames,
        inv: &inv_polys,
        fwd: &fwd_polys,
        gpu: gpu.as_ref(),
        cache: Some(&frame_cache),
        cfa: &cfa_of,
        norm: &norm_of,
        weight: features.weights.then_some(&weight_of as &(dyn Fn(usize, usize) -> f32 + Sync)),
        scale: 1,
        pixfrac,
        pad,
        passes: if features.robust { 3 } else { 2 },
        mask_bad: features.hotmask,
        white: white_limit,
        workers: 16,
    };
    // `cnt`: how many frames cover a canvas pixel
    let run_stack = |frames: &[usize]| -> (Vec<f32>, Vec<f32>, f64) {
      if features.drizzle {
        let s = drizzle(&DrizzleJob { frames, ..job });
        // a red or blue sample covers a quarter of its drop area in output pixels per frame
        (s.rgb, s.cover.iter().map(|c| c / (0.25 * (pixfrac * pixfrac) as f32)).collect(), s.rejected)
    } else {
        // the earlier method: demosaic, resample with bicubic interpolation, mean and standard
        // deviation, then the mean of what lies within 3.5 sigma
        let (s1, s2, cnt) = par_accumulate(
            frames,
            || (vec![0f32; 3 * cn], vec![0f32; 3 * cn], vec![0f32; cn]),
            |(s1, s2, c), i| {
                let rgb = demosaic(&cfa_of(i), w, h, false);
                ctx.warp_each(&rgb, fwd(i), pad, |k, p| {
                    for j in 0..3 {
                        s1[3 * k + j] += p[j];
                        s2[3 * k + j] += p[j] * p[j];
                    }
                    c[k] += 1.0;
                });
            },
            |a, b| {
                add(&mut a.0, &b.0);
                add(&mut a.1, &b.1);
                add(&mut a.2, &b.2);
            },
        );
        let mean: Vec<f32> = s1.par_iter().enumerate().map(|(k, &s)| s / cnt[k / 3].max(1.0)).collect();
        let mut std: Vec<f32> = s2.par_iter().enumerate().map(|(k, &s)| (s / cnt[k / 3].max(1.0) - mean[k] * mean[k]).max(0.0).sqrt()).collect();
        drop((s1, s2));
        let mut v: Vec<f32> = centre(5).filter(|&i| cnt[i] > 1.0).flat_map(|i| [std[3 * i], std[3 * i + 1], std[3 * i + 2]]).collect();
        let floor = median(&mut v);
        std.par_iter_mut().for_each(|s| *s = s.max(floor));
        let (s1, c2) = par_accumulate(
            frames,
            || (vec![0f32; 3 * cn], vec![0f32; 3 * cn]),
            |(s1, c2), i| {
                let rgb = demosaic(&cfa_of(i), w, h, false);
                ctx.warp_each(&rgb, fwd(i), pad, |k, p| {
                    for j in 0..3 {
                        if (p[j] - mean[3 * k + j]).abs() < 3.5 * std[3 * k + j] {
                            s1[3 * k + j] += p[j];
                            c2[3 * k + j] += 1.0;
                        }
                    }
                });
            },
            |a, b| {
                add(&mut a.0, &b.0);
                add(&mut a.1, &b.1);
            },
        );
        let rejected = 1.0 - c2.iter().map(|&v| v as f64).sum::<f64>() / (3.0 * cnt.iter().map(|&v| v as f64).sum::<f64>());
        let rgb: Vec<f32> = (0..3 * cn).into_par_iter().map(|k| if c2[k] > 0.0 { s1[k] / c2[k] } else { mean[k] }).collect();
        (rgb, cnt, rejected)
      }
    };
    let (sky_cam, cnt, rejected) = run_stack(&stack_frames);
    if gpu.is_some() && features.drizzle && std::env::var("STARSTACK_VERIFY").is_ok() {
        // the same stack on the CPU, to check that the GPU version computes the same thing
        let cpu = drizzle(&DrizzleJob { gpu: None, cache: None, ..job });
        // difference relative to the pixel value (or to 1 raw unit for the faint background)
        let mut diff: Vec<f32> = sky_cam.iter().zip(&cpu.rgb).zip(cnt.iter().flat_map(|c| [c, c, c])).filter(|(_, &c)| c > 1.0).map(|((a, b), _)| (a - b).abs() / b.abs().max(1.0)).collect();
        let over = diff.iter().filter(|&&d| d > 0.01).count();
        log!(
            "verify: GPU against CPU stack, relative difference: median {:.1e}, 99.9th percentile {:.1e}, largest {:.1e}; {} of {} values differ by more than 1%",
            median(&mut diff.clone()),
            percentile(&mut diff.clone(), 99.9),
            diff.iter().copied().fold(0f32, f32::max),
            over,
            diff.len()
        );
        diff.clear();
    }
    let mut sky_lin: Vec<f32> = sky_cam.par_chunks_exact(3).flat_map_iter(|p| to_linear([p[0], p[1], p[2]])).collect();
    drop(sky_cam);
    log!("stack done: {} frames, {:.3}% of samples rejected as outliers", stack_frames.len(), 100.0 * rejected);
    // For the measurements: the random noise of the stack, from two stacks of alternate frames.
    // Their half-difference contains no sky at all, only the noise that averaging reduces.
    let noise_lum: Option<Vec<f32>> = metrics_only.then(|| {
        let halves: Vec<Vec<f32>> = (0..2).map(|part| run_stack(&stack_frames.iter().copied().skip(part).step_by(2).collect::<Vec<_>>()).0).collect();
        (0..w * h)
            .into_par_iter()
            .map(|k| {
                let c = 3 * ((k / w + pad) * cw + k % w + pad);
                let p = to_linear([0, 1, 2].map(|j| (halves[0][c + j] - halves[1][c + j]) / 2.0));
                0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
            })
            .collect()
    });

    // optional: the same stack on a grid twice as fine. Because the stars sit at a different
    // sub-pixel position in every frame, this recovers detail that a single frame does not resolve.
    let drizzled: Option<(Vec<f32>, Vec<f32>)> = (double && !metrics_only).then(|| {
        let s = drizzle(&DrizzleJob { scale: 2, pixfrac: 0.7, pad: 0, workers: 8, ..job });
        log!("2x stack done");
        (s.rgb, s.cover)
    });
    drop(stat);
    // ---------------------------------------------------------------- flatten the sky background
    // very smooth model in the interior (keeps the Milky Way), tighter one near the borders where
    // only part of the frames overlap and the background is less well determined
    let valid_c: Vec<bool> = cnt.iter().map(|&c| c >= MIN_FRAMES).collect();
    let (bw, bh) = (cw / 8, ch / 8);
    let small = bin(&sky_lin, cw, ch, 3, 8);
    let vs = bin(&valid_c.iter().map(|&v| v as u8 as f32).collect::<Vec<_>>(), cw, ch, 1, 8);
    let mut small_med = vec![0f32; small.len()];
    for c in 0..3 {
        let plane: Vec<f32> = small.iter().skip(c).step_by(3).copied().collect();
        median5(&plane, bw, bh).iter().enumerate().for_each(|(k, &v)| small_med[3 * k + c] = v * vs[k]);
    }
    let masked_blur = |sigma: f32| -> Vec<f32> {
        let (a, b) = (blur(&small_med, bw, bh, 3, sigma), blur(&vs, bw, bh, 1, sigma));
        a.iter().enumerate().map(|(k, &v)| v / b[k / 3].max(1e-3)).collect()
    };
    let (wide, tight) = (masked_blur(60.0), masked_blur(15.0));
    let dist = distance(&vs.iter().map(|&v| v > 0.5).collect::<Vec<_>>(), bw, bh);
    let bg: Vec<f32> = (0..3 * bw * bh)
        .map(|k| {
            let t = (dist[k / 3] / 50.0).clamp(0.0, 1.0);
            let t = t * t * (3.0 - 2.0 * t);
            wide[k] * t + tight[k] * (1.0 - t)
        })
        .collect();
    sky_lin.par_chunks_mut(3 * cw).enumerate().for_each(|(y, row)| {
        for x in 0..cw {
            for c in 0..3 {
                row[3 * x + c] -= sample_clamped(&bg, bw, bh, 3, c, (x as f32 + 0.5) / 8.0 - 0.5, (y as f32 + 0.5) / 8.0 - 0.5);
            }
        }
    });
    log!("background flattened");

    // ---------------------------------------------------------------- renderings
    // foreground: the (sharp) static scene with its own exposure
    let mut fg: Vec<f32> = static_rgb.par_chunks_exact(3).flat_map_iter(|p| to_linear([p[0], p[1], p[2]])).collect();
    let mut bright: Vec<f32> = (0..w * h).filter(|&i| foreground[i]).flat_map(|i| [fg[3 * i], fg[3 * i + 1], fg[3 * i + 2]]).collect();
    let scale = if bright.is_empty() { 1.0 } else { FG_WHITE.powf(2.2) / percentile(&mut bright, 99.5).max(1e-3) };
    fg.par_iter_mut().for_each(|v| *v = srgb_gamma(*v * scale));
    let alpha = blur(&foreground.iter().map(|&b| b as u8 as f32).collect::<Vec<_>>(), w, h, 1, 1.5);
    let composite = |sky_img: &[f32]| -> Vec<f32> { sky_img.iter().zip(&fg).enumerate().map(|(k, (s, f))| s * (1.0 - alpha[k / 3]) + f * alpha[k / 3]).collect() };

    // the part of the canvas that corresponds to the reference frame
    let crop = |k: usize| (k / w + pad) * cw + k % w + pad;
    let sky_ref = || -> Vec<f32> { (0..w * h).flat_map(|k| [0, 1, 2].map(|c| sky_lin[3 * crop(k) + c])).collect() };

    // 1) star-aligned sky + foreground
    let valid: Vec<bool> = (0..w * h).map(|k| valid_c[crop(k)] && !foreground[k]).collect();

    // plate solving (optional): identify the stars of the stack in a catalogue, to draw constellations
    let sky_solution = annotate::load_catalog(&catalog_dir).map_err(|e| log!("no star catalogue ({e}): constellations are not drawn")).ok().and_then(|cat| {
        let lum: Vec<f32> = sky_ref().chunks_exact(3).map(|p| 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]).collect();
        // focal length in pixels: around the EXIF value if there is one, otherwise a wide search
        let diagonal = (w as f64).hypot(h as f64);
        let focal: Vec<f64> = match focal35 {
            Some(f35) => (-6..=6).map(|k| f35 / 43.27 * diagonal * 1.03f64.powi(k)).collect(),
            None => (0..56).map(|k| 0.2 * diagonal * 1.03f64.powi(k)).collect(),
        };
        // sharp stars first; if that fails, assume they are out of focus and smooth more
        let solution = [2.0, 6.0, 12.0].iter().find_map(|&sigma| {
            let blobs = detect_blobs(&lum, &valid, w, h, sigma);
            annotate::solve(&cat, &blobs, w, h, &focal).map(|s| (s, blobs))
        });
        let Some((s, blobs)) = solution else {
            log!("plate solve failed: constellations are not drawn");
            return None;
        };
        let (ra, dec, fov) = s.centre();
        log!("plate solve: {} stars identified (rms {:.2} px), centre RA {:.2}h Dec {:+.1} deg, diagonal field {:.0} deg", s.matched, s.rms, ra, dec, fov);
        if let Some(d) = annotate::depth(&lum, noise_lum.as_deref(), &valid, w, h, &s, &cat, &blobs) {
            log!("depth: 5-sigma limiting magnitude {:.1} in the centre, {:.1} in the corners (zero point from {} stars, scatter {:.2} mag)", d.limit.0, d.limit.1, d.calibration.0, d.calibration.1);
            log!("depth: {} of {} catalogue stars of magnitude 5.5-6.5 detected; {} objects detected in total, the faintest around magnitude {:.1}", d.faint_catalogue.1, d.faint_catalogue.0, d.detected.0, d.detected.1);
            let found = |lo: f32| d.completeness.iter().find(|b| b.0 == lo).map_or(0.0, |b| 100.0 * b.2 as f32 / b.1.max(1) as f32);
            if let Some(random) = d.limit_random {
                log!(
                    "snr [{}]: S/N of magnitude 6.0-6.5 stars against the random noise: {:.2} centre ({} stars), {:.2} edge ({} stars); limiting magnitude from random noise {:.2} / {:.2}, from all noise {:.2} / {:.2}; detected at 6.5-7.0: {:.1}%, at 7.0-7.5: {:.1}%",
                    features.list(),
                    d.snr.0,
                    d.snr_stars.0,
                    d.snr.1,
                    d.snr_stars.1,
                    random.0,
                    random.1,
                    d.limit.0,
                    d.limit.1,
                    found(6.5),
                    found(7.0)
                );
            }
            for (lo, total, found, chance) in d.completeness.iter().filter(|b| b.1 > 0) {
                log!("depth: magnitude {:.1}-{:.1}: {found} of {total} catalogue stars detected ({:.0}%, {chance} expected by chance)", lo, lo + 0.5, 100.0 * *found as f32 / *total as f32);
            }
        }
        // planets: where the ephemeris puts them, confirmed by a bright object at that place
        let mut planets: Vec<(&str, [f64; 2])> = Vec::new();
        for (name, dir) in julian_date.map(annotate::planets).unwrap_or_default() {
            let Some(p) = s.project(&dir).filter(|p| p[0] >= 0.0 && p[1] >= 0.0 && p[0] < w as f64 && p[1] < h as f64) else { continue };
            let (ra, dec) = annotate::ra_dec(&dir);
            let (k, d) = nearest(p, &blobs[..blobs.len().min(300)]);
            if d < 0.006 * (w as f64).hypot(h as f64) {
                log!("{name}: expected at RA {ra:.2}h Dec {dec:+.1} deg, found {d:.0} px from there as the {}. brightest object in the frame", k + 1);
                planets.push((name, blobs[k]));
            } else {
                log!("{name}: expected at RA {ra:.2}h Dec {dec:+.1} deg (pixel {:.0}, {:.0}), but no bright object is there", p[0], p[1]);
            }
        }
        Some((s, cat, planets))
    });
    if metrics_only {
        return;
    }
    let mut sky_img = tone_sky(&mut sky_ref(), &valid, w, h);
    save(&out_dir, "stacked", &composite(&sky_img), w, h, orientation, warp.as_ref(), 1);
    log!("wrote stacked");
    if let Some((solution, cat, planets)) = &sky_solution {
        // drawn on the sky before the foreground goes on top, so the lines pass behind it
        annotate::draw(&mut sky_img, w, h, solution, cat, &foreground, orientation, planets);
        save(&out_dir, "stacked_annotated", &composite(&sky_img), w, h, orientation, warp.as_ref(), 1);
        log!("wrote stacked_annotated");
    }
    drop(sky_img);

    // 2) star-aligned sky only: no foreground, every part of the sky that enough frames saw
    let valid: Vec<bool> = (0..w * h).map(|k| valid_c[crop(k)]).collect();
    let img = tone_sky(&mut sky_ref(), &valid, w, h);
    save(&out_dir, "stacked_sky_only", &img, w, h, orientation, warp.as_ref(), 1);
    log!("wrote stacked_sky_only");

    // 3) star trails: put the stacked sky back where each frame recorded it and keep the brightest value
    let mut trails = par_accumulate(
        &registered,
        || vec![f32::NEG_INFINITY; 3 * w * h],
        |acc, i| {
            inv(i).for_each(w, h, 0.0, |x, y, rx, ry| {
                let (cx, cy) = (rx + pad as f64, ry + pad as f64);
                if !(cx >= 0.0 && cy >= 0.0 && cx < (cw - 1) as f64 && cy < (ch - 1) as f64) || !valid_c[(cy + 0.5) as usize * cw + (cx + 0.5) as usize] {
                    return;
                }
                if let Some(p) = sample::<3>(&sky_lin, cw, ch, cx, cy) {
                    let o = &mut acc[3 * (y * w + x)..][..3];
                    for c in 0..3 {
                        o[c] = o[c].max(p[c]);
                    }
                }
            });
        },
        |a, b| a.iter_mut().zip(&b).for_each(|(x, y)| *x = x.max(*y)),
    );
    let valid: Vec<bool> = (0..w * h).map(|k| trails[3 * k].is_finite() && !foreground[k]).collect();
    trails.iter_mut().for_each(|v| {
        if !v.is_finite() {
            *v = 0.0
        }
    });
    let img = composite(&tone_sky(&mut trails, &valid, w, h));
    save(&out_dir, "star_trails", &img, w, h, orientation, warp.as_ref(), 1);
    log!("wrote star_trails");
    drop((trails, img));

    // 4) the star-aligned sky + foreground at twice the resolution
    if let Some((mut rgb, coverage)) = drizzled {
        let (w2, h2) = (2 * w, 2 * h);
        // position of an output pixel on the original pixel grid
        let coarse = |v: usize| (v as f32 + 0.5) / 2.0 - 0.5;
        rgb.par_chunks_mut(3 * w2).enumerate().for_each(|(y, row)| {
            for x in 0..w2 {
                let p = to_linear([row[3 * x], row[3 * x + 1], row[3 * x + 2]]);
                let (bx, by) = ((coarse(x) + pad as f32 + 0.5) / 8.0 - 0.5, (coarse(y) + pad as f32 + 0.5) / 8.0 - 0.5);
                for c in 0..3 {
                    row[3 * x + c] = p[c] - sample_clamped(&bg, bw, bh, 3, c, bx, by);
                }
            }
        });
        let valid: Vec<bool> = (0..w2 * h2).into_par_iter().map(|k| coverage[k] >= 3.0 && !foreground[(k / w2 / 2) * w + k % w2 / 2]).collect();
        let mut img = tone_sky(&mut rgb, &valid, w2, h2);
        img.par_chunks_mut(3 * w2).enumerate().for_each(|(y, row)| {
            for x in 0..w2 {
                let a = sample_clamped(&alpha, w, h, 1, 0, coarse(x), coarse(y));
                if a > 0.0 {
                    let f = sample_cubic(&fg, w, h, coarse(x), coarse(y));
                    for c in 0..3 {
                        row[3 * x + c] += (f[c].clamp(0.0, 1.0) - row[3 * x + c]) * a;
                    }
                }
            }
        });
        save(&out_dir, "stacked_2x", &img, w2, h2, orientation, warp.as_ref(), 2);
        log!("wrote stacked_2x");
    }
}
