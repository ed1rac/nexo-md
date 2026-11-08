// Evita abrir janela de console adicional no Windows em builds de release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nexomd_lib::run();
}
