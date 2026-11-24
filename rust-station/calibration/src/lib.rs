use std::error::Error;
use std::fmt::Write as _;
use std::io::{Cursor, Write as _};

use flate2::{Compression, write::ZlibEncoder};
use pdf_writer::{Content, Filter, Finish, Name, Pdf, Rect, Ref};
use resvg::{tiny_skia, usvg};

pub const WIDTH_PX: u32 = 1275;
pub const HEIGHT_PX: u32 = 2022;
pub const WIDTH_MM: f32 = 53.98;
pub const HEIGHT_MM: f32 = 85.60;
const PIXELS_PER_METRE: u32 = 23_622; // 600 dpi rounded to PNG's integer pixels per metre.

pub type CalibrationError = Box<dyn Error + Send + Sync>;

pub struct CalibrationCard {
    pub front_png: Vec<u8>,
    pub back_png: Vec<u8>,
}

pub fn render_calibration_card() -> Result<CalibrationCard, CalibrationError> {
    Ok(CalibrationCard {
        front_png: render_side("FRONT", "#182b43")?,
        back_png: render_side("BACK", "#732d45")?,
    })
}

fn render_side(side: &str, accent: &str) -> Result<Vec<u8>, CalibrationError> {
    let mut labels = String::new();
    for (label, y, scale, ink) in [
        ("TOP", 8.0, 0.65, "#fff"),
        ("CR80 CALIBRATION", 19.0, 0.43, "#333"),
        (side, 25.0, 1.45, accent),
        ("20 MM", 60.0, 0.56, "#333"),
        ("BOTTOM", 78.6, 0.62, "#fff"),
    ] {
        draw_label(&mut labels, label, y, scale, ink)?;
    }

    let svg = include_str!("card.svg")
        .replace("@accent", accent)
        .replace("@labels", &labels);
    let tree = usvg::Tree::from_str(&svg, &usvg::Options::default())?;
    let mut pixmap = tiny_skia::Pixmap::new(WIDTH_PX, HEIGHT_PX).ok_or("Cannot allocate card")?;
    resvg::render(
        &tree,
        tiny_skia::Transform::identity(),
        &mut pixmap.as_mut(),
    );
    let rgb: Vec<u8> = pixmap
        .data()
        .chunks_exact(4)
        .flat_map(|pixel| [pixel[0], pixel[1], pixel[2]])
        .collect();

    let mut bytes = Vec::new();
    let mut png = png::Encoder::new(&mut bytes, WIDTH_PX, HEIGHT_PX);
    png.set_color(png::ColorType::Rgb);
    png.set_depth(png::BitDepth::Eight);
    png.set_pixel_dims(Some(png::PixelDimensions {
        xppu: PIXELS_PER_METRE,
        yppu: PIXELS_PER_METRE,
        unit: png::Unit::Meter,
    }));
    let mut writer = png.write_header()?;
    writer.write_image_data(&rgb)?;
    writer.finish()?;
    Ok(bytes)
}

fn draw_label(
    output: &mut String,
    label: &str,
    y: f32,
    scale: f32,
    ink: &str,
) -> Result<(), CalibrationError> {
    // Stroke letters keep the same appearance without depending on installed fonts.
    let width = (label.len() * 6 - 2) as f32 * scale;
    let x = (WIDTH_MM - width) / 2.0;
    write!(
        output,
        r#"<g transform="translate({x} {y}) scale({scale})" fill="none" stroke="{ink}" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round">"#
    )?;
    for (index, character) in label.chars().enumerate() {
        let glyph = match character {
            ' ' => continue,
            '0' | 'O' => "M1 0H3L4 1V6L3 7H1L0 6V1Z",
            '2' => "M0 1L1 0H3L4 1V2L0 6V7H4",
            '8' => "M1 0H3L4 1V2.5L3 3.5H1L0 2.5V1ZM1 3.5H3L4 4.5V6L3 7H1L0 6V4.5Z",
            'A' => "M0 7V2L2 0L4 2V7M0 4H4",
            'B' => "M0 0H3L4 1V2.5L3 3.5H0V7H3L4 6V4.5L3 3.5M0 0V3.5",
            'C' => "M4 1L3 0H1L0 1V6L1 7H3L4 6",
            'F' => "M0 7V0H4M0 3H3",
            'I' => "M0 0H4M2 0V7M0 7H4",
            'K' => "M0 0V7M4 0L0 4M1 3L4 7",
            'L' => "M0 0V7H4",
            'M' => "M0 7V0L2 3L4 0V7",
            'N' => "M0 7V0L4 7V0",
            'P' => "M0 7V0H3L4 1V2.5L3 3.5H0",
            'R' => "M0 7V0H3L4 1V2.5L3 3.5H0M2 3.5L4 7",
            'T' => "M0 0H4M2 0V7",
            _ => return Err("Unsupported calibration label character".into()),
        };
        write!(
            output,
            r#"<path transform="translate({} 0)" d="{glyph}"/>"#,
            index * 6
        )?;
    }
    output.push_str("</g>");
    Ok(())
}

pub fn render_calibration_pdf(
    card: &CalibrationCard,
    rotate_back: bool,
) -> Result<Vec<u8>, CalibrationError> {
    let width = WIDTH_MM * 72.0 / 25.4;
    let height = HEIGHT_MM * 72.0 / 25.4;
    let bounds = Rect::new(0.0, 0.0, width, height);
    let mut pdf = Pdf::new();
    let pages_id = Ref::new(2);
    let mut catalog = pdf.catalog(Ref::new(1));
    catalog.pages(pages_id);
    catalog
        .viewer_preferences()
        .pair(Name(b"PrintScaling"), Name(b"None"));
    catalog.finish();
    pdf.pages(pages_id)
        .kids([Ref::new(3), Ref::new(6)])
        .count(2);

    for (page_number, png) in [&card.front_png, &card.back_png].into_iter().enumerate() {
        let page_id = Ref::new(3 + page_number as i32 * 3);
        let image_id = Ref::new(page_id.get() + 1);
        let content_id = Ref::new(page_id.get() + 2);
        let image_name = Name(b"Card");
        let mut page = pdf.page(page_id);
        page.parent(pages_id);
        page.media_box(bounds);
        page.contents(content_id);
        page.resources().x_objects().pair(image_name, image_id);
        page.finish();

        let pixels = decode_pixels(png)?;
        let mut encoded = ZlibEncoder::new(Vec::new(), Compression::default());
        encoded.write_all(&pixels)?;
        let encoded = encoded.finish()?;
        let mut image = pdf.image_xobject(image_id, &encoded);
        image.width(WIDTH_PX as i32);
        image.height(HEIGHT_PX as i32);
        image.color_space().device_rgb();
        image.bits_per_component(8);
        image.filter(Filter::FlateDecode);
        image.finish();

        let mut content = Content::new();
        let matrix = if page_number == 1 && rotate_back {
            [-width, 0.0, 0.0, -height, width, height]
        } else {
            [width, 0.0, 0.0, height, 0.0, 0.0]
        };
        content.transform(matrix);
        content.x_object(image_name);
        pdf.stream(content_id, &content.finish());
    }
    Ok(pdf.finish())
}

fn decode_pixels(png: &[u8]) -> Result<Vec<u8>, CalibrationError> {
    let mut reader = png::Decoder::new(Cursor::new(png)).read_info()?;
    let info = reader.info();
    if (info.width, info.height) != (WIDTH_PX, HEIGHT_PX)
        || info.color_type != png::ColorType::Rgb
        || info.bit_depth != png::BitDepth::Eight
        || info.animation_control.is_some()
    {
        return Err("Expected a 1275 × 2022 static RGB8 calibration PNG".into());
    }
    let mut pixels = vec![0; (WIDTH_PX * HEIGHT_PX * 3) as usize];
    let frame = reader.next_frame(&mut pixels)?;
    if frame.buffer_size() != pixels.len() {
        return Err("Calibration PNG contains an incomplete frame".into());
    }
    Ok(pixels)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_side_is_an_upright_600_dpi_card_with_its_own_art() {
        let card = render_calibration_card().unwrap();
        for (data, accent) in [
            (&card.front_png, [24, 43, 67]),
            (&card.back_png, [115, 45, 69]),
        ] {
            let reader = png::Decoder::new(Cursor::new(data)).read_info().unwrap();
            let info = reader.info();
            assert_eq!((info.width, info.height), (1275, 2022));
            let dimensions = info.pixel_dims.unwrap();
            assert_eq!((dimensions.xppu, dimensions.yppu), (23_622, 23_622));
            assert_eq!(dimensions.unit, png::Unit::Meter);
            let pixels = decode_pixels(data).unwrap();
            let pixel_at = |x, y| {
                let offset = (y * WIDTH_PX as usize + x) * 3;
                &pixels[offset..offset + 3]
            };
            assert_eq!(pixel_at(10, 200), accent);
            assert_eq!(pixel_at(10, 500), [255, 255, 255]);
            assert_eq!(pixel_at(637, 95), [255, 255, 255]);
            assert_eq!(pixel_at(10, 2000), accent);
        }
    }

    #[test]
    fn pdf_has_two_cr80_pages_and_rotates_only_the_requested_back() {
        let card = render_calibration_card().unwrap();
        let normal = render_calibration_pdf(&card, false).unwrap();
        let rotated = render_calibration_pdf(&card, true).unwrap();
        let width = (WIDTH_MM * 72.0 / 25.4).to_string();
        let height = (HEIGHT_MM * 72.0 / 25.4).to_string();
        let upright = format!("{width} 0 0 {height} 0 0 cm");
        let upside_down = format!("-{width} 0 0 -{height} {width} {height} cm");
        let media_box = format!("/MediaBox [0 0 {width} {height}]");
        let normal = String::from_utf8_lossy(&normal);
        let rotated = String::from_utf8_lossy(&rotated);
        assert_eq!(normal.matches(&media_box).count(), 2);
        assert_eq!(rotated.matches(&media_box).count(), 2);
        assert_eq!(normal.matches(&upright).count(), 2);
        assert_eq!(rotated.matches(&upright).count(), 1);
        assert_eq!(rotated.matches(&upside_down).count(), 1);
    }
}
