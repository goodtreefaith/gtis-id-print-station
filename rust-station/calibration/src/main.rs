use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use id_card_calibration::{CalibrationError, render_calibration_card, render_calibration_pdf};

const USAGE: &str = "Usage: id-card-calibration <new-output-directory> [--rotate-back]";

fn run() -> Result<(), CalibrationError> {
    let mut args = env::args_os().skip(1);
    let directory = args.next().ok_or(USAGE)?;
    if directory == "--help" || directory == "-h" {
        println!("{USAGE}");
        return Ok(());
    }
    if directory.to_string_lossy().starts_with("--") {
        return Err(USAGE.into());
    }
    let rotate_back = match args.next() {
        None => false,
        Some(option) if option == "--rotate-back" && args.next().is_none() => true,
        Some(_) => return Err(USAGE.into()),
    };

    let output = PathBuf::from(directory);
    let card = render_calibration_card()?;
    let pdf = render_calibration_pdf(&card, rotate_back)?;
    fs::create_dir(&output)?;
    fs::write(output.join("front.png"), card.front_png)?;
    fs::write(output.join("back.png"), card.back_png)?;
    fs::write(output.join("calibration.pdf"), pdf)?;
    println!(
        "Wrote front.png, back.png and calibration.pdf to {}",
        output.display()
    );
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
