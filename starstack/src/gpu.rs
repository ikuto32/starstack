//! GPU version of the drizzle accumulation (a wgpu compute shader).
//!
//! The CPU version scatters every raw sample onto the output pixels it overlaps. A GPU cannot
//! scatter without races, so the shader gathers instead: for every output pixel it finds where
//! that pixel lies in the frame, looks at the raw samples around that place, and adds up the
//! overlap of each sample's drop with the pixel. The result is the same sums.

use crate::Poly;
use rayon::prelude::*;
use wgpu::util::DeviceExt;

const SHADER: &str = r#"
struct Params {
    dims: vec4<u32>,   // output width, output height, first row of this band, rows in this band
    frame: vec4<u32>,  // frame width, frame height, Bayer phase (x + 2 y), search radius
    flags: vec4<u32>,  // outlier rejection on, samples carry weights
    f: vec4<f32>,      // scale, pad, half drop size (output pixels), polynomial scale (w / 2)
    g: vec4<f32>,      // polynomial centre x, y
    coef: array<vec4<f32>, 25>, // 4 polynomials x 25 coefficients: reference -> frame (x, y), frame -> reference (x, y)
}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var frame_tex: texture_2d<f32>;   // r = value, g = weight (0 = no data)
@group(0) @binding(2) var mean_tex: texture_2d<f32>;
@group(0) @binding(3) var spread_tex: texture_2d<f32>;
@group(0) @binding(4) var<storage, read_write> acc: array<f32>; // per pixel: 3 colours x (weight, weight*v, weight*v*v, area)

fn cf(i: u32) -> f32 {
    return P.coef[i / 4u][i % 4u];
}

fn poly(base: u32, u: f32, v: f32) -> f32 {
    var r = 0.0;
    for (var i = 4; i >= 0; i--) {
        let b = base + u32(i) * 5u;
        let a = (((cf(b + 4u) * v + cf(b + 3u)) * v + cf(b + 2u)) * v + cf(b + 1u)) * v + cf(b);
        r = r * u + a;
    }
    return r;
}

fn warp(base: u32, p: vec2<f32>) -> vec2<f32> {
    let u = (p.x - P.g.x) / P.f.w;
    let v = (p.y - P.g.y) / P.f.w;
    return vec2<f32>(poly(base, u, v), poly(base + 25u, u, v));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let X = id.x;
    let row = id.y;
    if (X >= P.dims.x || row >= P.dims.w) {
        return;
    }
    let Y = row + P.dims.z;
    let scale = P.f.x;
    let pad = P.f.y;
    let half = P.f.z;
    let fx = f32(X);
    let fy = f32(Y);
    // where this output pixel lies in the frame
    let r = vec2<f32>((fx + 0.5) / scale - 0.5 - pad, (fy + 0.5) / scale - 0.5 - pad);
    var p = warp(0u, r);
    // The two polynomials were fitted separately and drift apart outside the area that the
    // stars covered. The drops are placed with the frame -> reference one, so correct the
    // position until that one maps it back onto this pixel.
    p = p - (warp(50u, p) - r);
    p = p - (warp(50u, p) - r);
    let q0 = vec2<i32>(floor(p + vec2<f32>(0.5, 0.5)));
    let R = i32(P.frame.w);
    var a: array<vec4<f32>, 3>;
    for (var dy = -R; dy <= R; dy++) {
        for (var dx = -R; dx <= R; dx++) {
            let q = q0 + vec2<i32>(dx, dy);
            if (q.x < 0 || q.y < 0 || q.x >= i32(P.frame.x) || q.y >= i32(P.frame.y)) {
                continue;
            }
            let t = textureLoad(frame_tex, q, 0);
            let wt = t.g;
            if (wt <= 0.0) {
                continue;
            }
            // where the drop of this sample lands on the output grid
            let o = warp(50u, vec2<f32>(q));
            let xc = scale * (o.x + pad + 0.5) - 0.5;
            let yc = scale * (o.y + pad + 0.5) - 0.5;
            let ox = min(xc + half, fx + 0.5) - max(xc - half, fx - 0.5);
            let oy = min(yc + half, fy + 0.5) - max(yc - half, fy - 0.5);
            if (ox <= 0.0 || oy <= 0.0) {
                continue;
            }
            let c = ((u32(q.x) + (P.frame.z & 1u)) & 1u) + ((u32(q.y) + (P.frame.z >> 1u)) & 1u);
            let v = t.r;
            if (P.flags.x != 0u) {
                // judged against the output pixel under the centre of the drop, like the CPU version
                let kc = vec2<i32>(clamp(i32(floor(xc + 0.5)), 0, i32(P.dims.x) - 1), clamp(i32(floor(yc + 0.5)), 0, i32(P.dims.y) - 1));
                let m = textureLoad(mean_tex, kc, 0)[c];
                var allowed = textureLoad(spread_tex, kc, 0)[c];
                if (P.flags.y != 0u) {
                    allowed = allowed + 1.0 / wt;
                }
                let d = v - m;
                if (d * d >= 12.25 * allowed) {
                    continue;
                }
            }
            let area = ox * oy;
            let w2 = area * wt;
            a[c] += vec4<f32>(w2, w2 * v, w2 * v * v, area);
        }
    }
    let base = (row * P.dims.x + X) * 12u;
    for (var c = 0u; c < 3u; c++) {
        acc[base + c * 4u] += a[c].x;
        acc[base + c * 4u + 1u] += a[c].y;
        acc[base + c * 4u + 2u] += a[c].z;
        acc[base + c * 4u + 3u] += a[c].w;
    }
}
"#;

pub struct Gpu {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    layout: wgpu::BindGroupLayout,
    max_band_bytes: u64,
    max_texture: u32,
    pub name: String,
}

pub struct Job<'a> {
    /// frame size and output size in pixels
    pub w: usize,
    pub h: usize,
    pub ow: usize,
    pub oh: usize,
    pub scale: f32,
    pub pad: f32,
    /// half the side of a drop in output pixels
    pub half: f32,
    /// how many frame pixels around the mapped position can reach an output pixel
    pub radius: u32,
    pub phase: (usize, usize),
    pub weighted: bool,
    pub frames: &'a [usize],
    /// warp reference -> frame and frame -> reference, per frame
    pub fwd: &'a [Option<Poly>],
    pub inv: &'a [Option<Poly>],
    /// per frame: (value, weight) interleaved for every sensor pixel, weight 0 = no data
    pub prepare: &'a (dyn Fn(usize) -> std::sync::Arc<Vec<f32>> + Sync),
    /// mean and allowed spread from the previous pass (3 values per output pixel): rejects outliers
    pub previous: Option<(&'a [f32], &'a [f32])>,
}

/// Polynomial coefficients as a 5 x 5 table (power of u, power of v) per axis.
fn coefficients(p: &Poly) -> [f32; 50] {
    let mut out = [0f32; 50];
    let mut n = 0;
    for i in 0..=p.order {
        for j in 0..=p.order - i {
            out[i * 5 + j] = p.cx[n] as f32;
            out[25 + i * 5 + j] = p.cy[n] as f32;
            n += 1;
        }
    }
    out
}

impl Gpu {
    /// The most capable graphics card of the machine, if there is one.
    pub fn new() -> Option<Gpu> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::default());
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: None,
        }))?;
        let info = adapter.get_info();
        if info.device_type == wgpu::DeviceType::Cpu {
            return None; // a software renderer would be slower than the CPU code
        }
        let limits = adapter.limits();
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor { label: None, required_features: wgpu::Features::empty(), required_limits: limits.clone(), memory_hints: wgpu::MemoryHints::Performance },
            None,
        ))
        .ok()?;
        let texture = |binding| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::COMPUTE,
            ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: false }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false },
            count: None,
        };
        let buffer = |binding, ty| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::COMPUTE,
            ty: wgpu::BindingType::Buffer { ty, has_dynamic_offset: false, min_binding_size: None },
            count: None,
        };
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[
                buffer(0, wgpu::BufferBindingType::Uniform),
                texture(1),
                texture(2),
                texture(3),
                buffer(4, wgpu::BufferBindingType::Storage { read_only: false }),
            ],
        });
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: None, source: wgpu::ShaderSource::Wgsl(SHADER.into()) });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: None, bind_group_layouts: &[&layout], push_constant_ranges: &[] });
        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: None,
            layout: Some(&pipeline_layout),
            module: &module,
            entry_point: "main",
            compilation_options: Default::default(),
            cache: None,
        });
        Some(Gpu {
            device,
            queue,
            pipeline,
            layout,
            max_band_bytes: (limits.max_storage_buffer_binding_size as u64).min(limits.max_buffer_size).min(512 << 20),
            max_texture: limits.max_texture_dimension_2d,
            name: format!("{} ({:?})", info.name, info.backend),
        })
    }

    /// Whether an output of this size can be handled.
    pub fn fits(&self, ow: usize, oh: usize, w: usize, h: usize) -> bool {
        ow.max(oh).max(w).max(h) <= self.max_texture as usize && (ow * 48) as u64 <= self.max_band_bytes
    }

    fn texture(&self, w: usize, h: usize, format: wgpu::TextureFormat) -> wgpu::Texture {
        self.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d { width: w as u32, height: h as u32, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        })
    }

    fn write(&self, texture: &wgpu::Texture, y0: usize, rows: usize, width: usize, floats_per_pixel: usize, data: &[f32]) {
        self.queue.write_texture(
            wgpu::ImageCopyTexture { texture, mip_level: 0, origin: wgpu::Origin3d { x: 0, y: y0 as u32, z: 0 }, aspect: wgpu::TextureAspect::All },
            bytemuck::cast_slice(data),
            wgpu::ImageDataLayout { offset: 0, bytes_per_row: Some((width * floats_per_pixel * 4) as u32), rows_per_image: Some(rows as u32) },
            wgpu::Extent3d { width: width as u32, height: rows as u32, depth_or_array_layers: 1 },
        );
    }

    /// A texture holding 3 values per pixel (stored as RGBA).
    fn rgb_texture(&self, data: Option<&[f32]>, w: usize, h: usize) -> wgpu::Texture {
        let Some(data) = data else { return self.texture(1, 1, wgpu::TextureFormat::Rgba32Float) };
        let texture = self.texture(w, h, wgpu::TextureFormat::Rgba32Float);
        const ROWS: usize = 256;
        for y0 in (0..h).step_by(ROWS) {
            let rows = ROWS.min(h - y0);
            let mut rgba = vec![0f32; 4 * w * rows];
            rgba.par_chunks_exact_mut(4).zip(data[3 * y0 * w..3 * (y0 + rows) * w].par_chunks_exact(3)).for_each(|(o, p)| o[..3].copy_from_slice(p));
            self.write(&texture, y0, rows, w, 4, &rgba);
        }
        texture
    }

    /// One pass over all frames. Returns, per output pixel and colour (3 values per pixel):
    /// sum of weights, of weight x value, of weight x value squared, and of drop area.
    pub fn accumulate(&self, job: &Job) -> [Vec<f32>; 4] {
        let (ow, oh) = (job.ow, job.oh);
        let band_rows = ((self.max_band_bytes / (ow as u64 * 48)) as usize).clamp(1, oh);
        let bands: Vec<(usize, usize)> = (0..oh).step_by(band_rows).map(|y0| (y0, band_rows.min(oh - y0))).collect();
        let buffers: Vec<wgpu::Buffer> = bands
            .iter()
            .map(|&(_, rows)| {
                self.device.create_buffer(&wgpu::BufferDescriptor {
                    label: None,
                    size: (ow * rows * 48) as u64,
                    usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
                    mapped_at_creation: false,
                })
            })
            .collect();
        let frame_texture = self.texture(job.w, job.h, wgpu::TextureFormat::Rg32Float);
        let mean_texture = self.rgb_texture(job.previous.map(|p| p.0), ow, oh);
        let spread_texture = self.rgb_texture(job.previous.map(|p| p.1), ow, oh);
        let view = |t: &wgpu::Texture| t.create_view(&wgpu::TextureViewDescriptor::default());
        let (frame_view, mean_view, spread_view) = (view(&frame_texture), view(&mean_texture), view(&spread_texture));

        // the frames are prepared on the CPU a few at a time, in parallel, and sent one by one
        let debug = std::env::var("STARSTACK_DEBUG").is_ok();
        let (mut t_prepare, mut t_gpu) = (0f32, 0f32);
        let start = std::time::Instant::now();
        for chunk in job.frames.chunks(rayon::current_num_threads().clamp(8, 32)) {
            let t = std::time::Instant::now();
            let prepared: Vec<std::sync::Arc<Vec<f32>>> = chunk.par_iter().map(|&i| (job.prepare)(i)).collect();
            t_prepare += t.elapsed().as_secs_f32();
            let t = std::time::Instant::now();
            for (&i, data) in chunk.iter().zip(&prepared) {
                self.write(&frame_texture, 0, job.h, job.w, 2, &data[..]);
                let (fwd, inv) = (job.fwd[i].as_ref().unwrap(), job.inv[i].as_ref().unwrap());
                let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
                for (&(y0, rows), buffer) in bands.iter().zip(&buffers) {
                    let mut params: Vec<u32> = vec![
                        ow as u32,
                        oh as u32,
                        y0 as u32,
                        rows as u32,
                        job.w as u32,
                        job.h as u32,
                        (job.phase.0 + 2 * job.phase.1) as u32,
                        job.radius,
                        job.previous.is_some() as u32,
                        job.weighted as u32,
                        0,
                        0,
                    ];
                    let floats = [job.scale, job.pad, job.half, (fwd.w / 2.0) as f32, (fwd.w / 2.0) as f32, (fwd.h / 2.0) as f32, 0.0, 0.0];
                    params.extend(floats.iter().chain(&coefficients(fwd)).chain(&coefficients(inv)).map(|f| f.to_bits()));
                    let uniform = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&params), usage: wgpu::BufferUsages::UNIFORM });
                    let bind = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                        label: None,
                        layout: &self.layout,
                        entries: &[
                            wgpu::BindGroupEntry { binding: 0, resource: uniform.as_entire_binding() },
                            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&frame_view) },
                            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(&mean_view) },
                            wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::TextureView(&spread_view) },
                            wgpu::BindGroupEntry { binding: 4, resource: buffer.as_entire_binding() },
                        ],
                    });
                    let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor::default());
                    pass.set_pipeline(&self.pipeline);
                    pass.set_bind_group(0, &bind, &[]);
                    pass.dispatch_workgroups(ow.div_ceil(8) as u32, rows.div_ceil(8) as u32, 1);
                }
                self.queue.submit([encoder.finish()]);
                self.device.poll(wgpu::Maintain::Wait);
            }
            t_gpu += t.elapsed().as_secs_f32();
        }
        let t_frames = start.elapsed().as_secs_f32();

        // bring the sums back
        let mut acc: [Vec<f32>; 4] = std::array::from_fn(|_| vec![0f32; 3 * ow * oh]);
        let staging = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: (ow * band_rows * 48) as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        for (&(y0, rows), buffer) in bands.iter().zip(&buffers) {
            let bytes = (ow * rows * 48) as u64;
            let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
            encoder.copy_buffer_to_buffer(buffer, 0, &staging, 0, bytes);
            self.queue.submit([encoder.finish()]);
            let slice = staging.slice(..bytes);
            slice.map_async(wgpu::MapMode::Read, |r| r.expect("cannot read back from the GPU"));
            self.device.poll(wgpu::Maintain::Wait);
            {
                let mapped = slice.get_mapped_range();
                let data: &[f32] = bytemuck::cast_slice(&mapped);
                for (j, out) in acc.iter_mut().enumerate() {
                    out[3 * y0 * ow..3 * (y0 + rows) * ow].par_iter_mut().enumerate().for_each(|(n, o)| *o = data[n / 3 * 12 + n % 3 * 4 + j]);
                }
            }
            staging.unmap();
        }
        if debug {
            eprintln!("debug gpu pass: prepare {t_prepare:.1}s, upload + compute {t_gpu:.1}s, read back {:.1}s", start.elapsed().as_secs_f32() - t_frames);
        }
        acc
    }
}
