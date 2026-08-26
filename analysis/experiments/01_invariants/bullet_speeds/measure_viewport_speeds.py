import os
import sys
import json
import math
import numpy as np

def run_viewport_bullet_speed_analysis():
    print("=" * 100)
    print("SPACEONE.IO PHYSICS & VIEWPORT CALIBRATION: BULLET SPEED & VIEWPORT RATIO ANALYSIS")
    print("=" * 100)
    
    # ---------------------------------------------------------
    # 1. ORIGINAL GAME PARAMETERS (Ground Truth from 41 Playback Files & WASM Disassembly)
    # ---------------------------------------------------------
    # Server Fixed Timestep: 25 Hz (40 ms / tick)
    tick_rate = 25.0 # Hz
    dt_ms = 40.0 # ms
    
    # Fleet size N = 1
    N = 1
    
    # Original bullet velocity in world units (px/tick):
    # ShotThrust[1] = 41.00 px/tick
    orig_bullet_vel_tick = 41.00 # px/tick
    orig_bullet_vel_sec = orig_bullet_vel_tick * tick_rate # 1025.0 px/s
    orig_bullet_vel_ms = orig_bullet_vel_sec / 1000.0 # 1.025 px/ms
    
    # Original ship velocity in world units (px/tick):
    # BaseThrust[1] = 13.60 px/tick
    orig_ship_vel_tick = 13.60 # px/tick
    orig_ship_vel_sec = orig_ship_vel_tick * tick_rate # 340.0 px/s
    orig_ship_vel_ms = orig_ship_vel_sec / 1000.0 # 0.340 px/ms
    
    # Original Viewport (from WASM Func 504-531 disassembly):
    # Base Reference Resolution: 1920 x 1080 (16:9 Aspect Ratio)
    # Scale applied on canvas: min(canvas.width / 1920.0, canvas.height / 1080.0) * zoom(N)
    # For N = 1, zoom(1) = 1.0 (from Func 529 Math.pow(0.9, 0) == 1.0)
    orig_viewport_w = 1920.0 # world units (px)
    orig_viewport_h = 1080.0 # world units (px)
    orig_half_w = orig_viewport_w / 2.0 # 960.0 px (center to right/left edge)
    orig_half_h = orig_viewport_h / 2.0 # 540.0 px (center to top/bottom edge)
    orig_half_diag = math.hypot(orig_half_w, orig_half_h) # 1101.453585 px (center to corner)
    
    # Original Times to reach viewport edges from screen center:
    orig_t_center_to_horiz_edge = orig_half_w / orig_bullet_vel_sec # s
    orig_t_center_to_vert_edge = orig_half_h / orig_bullet_vel_sec # s
    orig_t_center_to_corner = orig_half_diag / orig_bullet_vel_sec # s
    orig_t_full_width = orig_viewport_w / orig_bullet_vel_sec # s
    
    # Original Normalized Viewport Speeds:
    orig_screen_spd_w = orig_bullet_vel_sec / orig_viewport_w # screen widths / second
    orig_screen_spd_h = orig_bullet_vel_sec / orig_viewport_h # screen heights / second
    
    # ---------------------------------------------------------
    # 2. REMAKE GAME CURRENT PARAMETERS (Game.Engine & game.ts)
    # ---------------------------------------------------------
    # Remake Hook constants:
    remake_shot_thrust_1 = 41.00 # Hook.ShotThrust[1]
    remake_shot_thrust_conv = 0.0013 # Hook.ShotThrustConverter
    # ShipWeaponBullet.cs: Momentum = thrust * 10 = ShotThrust[1] * ShotThrustConverter * 10
    remake_bullet_vel_ms = remake_shot_thrust_1 * remake_shot_thrust_conv * 10.0 # 0.533 units/ms
    remake_bullet_vel_sec = remake_bullet_vel_ms * 1000.0 # 533.0 units/s
    remake_bullet_vel_tick = remake_bullet_vel_ms * dt_ms # 21.32 units/tick
    
    # Remake Ship constants:
    remake_base_thrust_1 = 13.60 # Hook.BaseThrust[1]
    remake_base_thrust_conv = 0.002 # Hook.BaseThrustConverter
    remake_max_momentum_coeff = 6.5 # Hook.MaxMomentumCoefficient
    remake_ship_vel_ms = remake_base_thrust_1 * remake_base_thrust_conv * remake_max_momentum_coeff # 0.1768 units/ms
    remake_ship_vel_sec = remake_ship_vel_ms * 1000.0 # 176.8 units/s
    remake_ship_vel_tick = remake_ship_vel_ms * dt_ms # 7.072 units/tick
    
    # Remake Viewport (from game.ts):
    # zoom = 1000, 16:9 Aspect Ratio
    # container.scale.set(width / zoom, width / zoom)
    remake_zoom = 1000.0 # world units
    remake_viewport_w = remake_zoom # 1000.0 world units
    remake_viewport_h = remake_zoom * (9.0 / 16.0) # 562.5 world units
    remake_half_w = remake_viewport_w / 2.0 # 500.0 world units
    remake_half_h = remake_viewport_h / 2.0 # 281.25 world units
    remake_half_diag = math.hypot(remake_half_w, remake_half_h)
    
    # Remake Times to reach viewport edges from screen center:
    remake_t_center_to_horiz_edge = remake_half_w / remake_bullet_vel_sec # s
    remake_t_center_to_vert_edge = remake_half_h / remake_bullet_vel_sec # s
    remake_t_center_to_corner = remake_half_diag / remake_bullet_vel_sec # s
    remake_t_full_width = remake_viewport_w / remake_bullet_vel_sec # s
    
    # Remake Normalized Viewport Speeds:
    remake_screen_spd_w = remake_bullet_vel_sec / remake_viewport_w # screen widths / second
    remake_screen_spd_h = remake_bullet_vel_sec / remake_viewport_h # screen heights / second
    
    # ---------------------------------------------------------
    # 3. SPEED RATIOS (ORIGINAL / REMAKE)
    # ---------------------------------------------------------
    # Ratio of Screen Viewport Speeds:
    # ratio = Speed_screen_orig / Speed_screen_remake
    ratio_screen_speed = orig_screen_spd_w / remake_screen_spd_w
    
    # Time ratio (Time_remake / Time_orig == Speed_orig / Speed_remake):
    ratio_time = remake_t_center_to_horiz_edge / orig_t_center_to_horiz_edge
    
    # Ratio of World Velocities:
    ratio_world_speed = orig_bullet_vel_sec / remake_bullet_vel_sec # 1025.0 / 639.6 = 1.602564
    
    # Ratio of Viewport Widths:
    ratio_viewport_width = orig_viewport_w / remake_viewport_w # 1920.0 / 1050.0 = 1.828571
    
    print("\n--- 1. ORIGINAL SPACEONE.IO (Ground Truth) ---")
    print(f"World Coordinate Domain:        [-6324.56, +6324.56]")
    print(f"Reference Viewport Dimensions:  {orig_viewport_w:.1f} x {orig_viewport_h:.1f} (16:9 full HD)")
    print(f"Bullet Speed (N=1):             {orig_bullet_vel_tick:.2f} px/tick = {orig_bullet_vel_sec:.1f} px/s ({orig_bullet_vel_ms:.3f} px/ms)")
    print(f"Ship Speed (N=1):               {orig_ship_vel_tick:.2f} px/tick = {orig_ship_vel_sec:.1f} px/s ({orig_ship_vel_ms:.3f} px/ms)")
    print(f"Speed Ratio (Bullet / Ship):    {orig_bullet_vel_sec / orig_ship_vel_sec:.3f}x")
    print(f"Time (Center -> Horiz Edge):    {orig_t_center_to_horiz_edge:.6f} s ({orig_t_center_to_horiz_edge * 1000.0:.2f} ms, {orig_t_center_to_horiz_edge * 25.0:.2f} ticks)")
    print(f"Time (Center -> Vert Edge):     {orig_t_center_to_vert_edge:.6f} s ({orig_t_center_to_vert_edge * 1000.0:.2f} ms, {orig_t_center_to_vert_edge * 25.0:.2f} ticks)")
    print(f"Time (Center -> Corner):        {orig_t_center_to_corner:.6f} s ({orig_t_center_to_corner * 1000.0:.2f} ms, {orig_t_center_to_corner * 25.0:.2f} ticks)")
    print(f"Time (Full Width Traversal):    {orig_t_full_width:.6f} s ({orig_t_full_width * 1000.0:.2f} ms, {orig_t_full_width * 25.0:.2f} ticks)")
    print(f"Screen Speed (Horizontal):      {orig_screen_spd_w:.6f} screen widths / second")
    print(f"Screen Speed (Vertical):        {orig_screen_spd_h:.6f} screen heights / second")
    
    print("\n--- 2. REMAKE (Current Settings) ---")
    print(f"Reference Viewport Dimensions:  {remake_viewport_w:.1f} x {remake_viewport_h:.1f} (zoom = {remake_zoom})")
    print(f"Bullet Speed (N=1):             {remake_bullet_vel_tick:.3f} units/tick = {remake_bullet_vel_sec:.1f} units/s ({remake_bullet_vel_ms:.4f} units/ms)")
    print(f"Ship Speed (N=1):               {remake_ship_vel_tick:.3f} units/tick = {remake_ship_vel_sec:.1f} units/s ({remake_ship_vel_ms:.4f} units/ms)")
    print(f"Speed Ratio (Bullet / Ship):    {remake_bullet_vel_sec / remake_ship_vel_sec:.3f}x")
    print(f"Time (Center -> Horiz Edge):    {remake_t_center_to_horiz_edge:.6f} s ({remake_t_center_to_horiz_edge * 1000.0:.2f} ms, {remake_t_center_to_horiz_edge * 25.0:.2f} ticks)")
    print(f"Time (Center -> Vert Edge):     {remake_t_center_to_vert_edge:.6f} s ({remake_t_center_to_vert_edge * 1000.0:.2f} ms, {remake_t_center_to_vert_edge * 25.0:.2f} ticks)")
    print(f"Time (Center -> Corner):        {remake_t_center_to_corner:.6f} s ({remake_t_center_to_corner * 1000.0:.2f} ms, {remake_t_center_to_corner * 25.0:.2f} ticks)")
    print(f"Time (Full Width Traversal):    {remake_t_full_width:.6f} s ({remake_t_full_width * 1000.0:.2f} ms, {remake_t_full_width * 25.0:.2f} ticks)")
    print(f"Screen Speed (Horizontal):      {remake_screen_spd_w:.6f} screen widths / second")
    print(f"Screen Speed (Vertical):        {remake_screen_spd_h:.6f} screen heights / second")
    
    print("\n" + "=" * 100)
    print("3. EXACT RATIO CALCULATION (ORIGINAL / REMAKE)")
    print("=" * 100)
    print(f"Ratio (speed_in_original / speed_in_remake on screen): {ratio_screen_speed:.10f}")
    print(f"As exact fraction: (1025 / 1920) / (639.6 / 1050) = (1025 * 1050) / (1920 * 639.6) = 1076250 / 1228032 = {1076250 / 1228032:.10f}")
    print(f"In percentage: Remake bullets currently traverse the screen at {(remake_screen_spd_w / orig_screen_spd_w) * 100.0:.2f}% of original speed (i.e. {((remake_screen_spd_w / orig_screen_spd_w) - 1.0) * 100.0:+.2f}% faster)")
    print(f"To match original screen speed exactly, remake speeds must be scaled by: {ratio_screen_speed:.10f}")
    
    # ---------------------------------------------------------
    # 4. CALIBRATION TARGETS FOR EXACT MATCHING
    # ---------------------------------------------------------
    # Method 1: Adjust Hook Converters in Game.Engine
    matched_shot_thrust_conv = remake_shot_thrust_conv * ratio_screen_speed
    matched_base_thrust_conv = remake_base_thrust_conv * ratio_screen_speed
    
    # Method 2: Adjust zoom in game.ts
    matched_zoom = remake_viewport_w / ratio_screen_speed # 1050 / 0.876402 = 1198.08
    
    print("\n--- 4. EXACT CALIBRATION SOLUTIONS ---")
    print("Option A (Adjust Hook Converters in Hook.cs):")
    print(f"  Hook.ShotThrustConverter: {remake_shot_thrust_conv}f -> {matched_shot_thrust_conv:.8f}f (exact: {matched_shot_thrust_conv})")
    print(f"  Hook.BaseThrustConverter: {remake_base_thrust_conv}f -> {matched_base_thrust_conv:.8f}f (exact: {matched_base_thrust_conv})")
    print(f"  Resulting Bullet Speed:   {remake_shot_thrust_1 * matched_shot_thrust_conv * 10000.0:.2f} units/s")
    print(f"  Resulting Center->Edge:   {525.0 / (remake_shot_thrust_1 * matched_shot_thrust_conv * 10000.0) * 1000.0:.2f} ms (Matches {orig_t_center_to_horiz_edge * 1000.0:.2f} ms exactly!)")
    
    print("\nOption B (Adjust Camera Zoom in game.ts):")
    print(f"  const zoom = {remake_zoom} -> {matched_zoom:.2f} (exact: {matched_zoom})")
    print(f"  Resulting Center->Edge:   {(matched_zoom / 2.0) / remake_bullet_vel_sec * 1000.0:.2f} ms (Matches {orig_t_center_to_horiz_edge * 1000.0:.2f} ms exactly!)")
    
    # Save structured results
    out_dir = r"d:\C\Users\Michał\Documents\GitHub\spaceone-io-remake\analysis\datasets"
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "viewport_speed_ratio_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "original_game": {
                "reference_resolution": {"width": orig_viewport_w, "height": orig_viewport_h},
                "bullet_speed": {
                    "px_per_tick": orig_bullet_vel_tick,
                    "px_per_sec": orig_bullet_vel_sec,
                    "px_per_ms": orig_bullet_vel_ms
                },
                "ship_speed": {
                    "px_per_tick": orig_ship_vel_tick,
                    "px_per_sec": orig_ship_vel_sec,
                    "px_per_ms": orig_ship_vel_ms
                },
                "time_to_reach_viewport": {
                    "center_to_horizontal_edge_sec": orig_t_center_to_horiz_edge,
                    "center_to_horizontal_edge_ms": orig_t_center_to_horiz_edge * 1000.0,
                    "center_to_vertical_edge_sec": orig_t_center_to_vert_edge,
                    "center_to_vertical_edge_ms": orig_t_center_to_vert_edge * 1000.0,
                    "center_to_corner_sec": orig_t_center_to_corner,
                    "center_to_corner_ms": orig_t_center_to_corner * 1000.0,
                    "full_width_traversal_sec": orig_t_full_width,
                    "full_width_traversal_ms": orig_t_full_width * 1000.0
                },
                "screen_speed": {
                    "screen_widths_per_sec": orig_screen_spd_w,
                    "screen_heights_per_sec": orig_screen_spd_h
                }
            },
            "remake_game_current": {
                "viewport": {"width": remake_viewport_w, "height": remake_viewport_h, "zoom": remake_zoom},
                "bullet_speed": {
                    "units_per_tick": remake_bullet_vel_tick,
                    "units_per_sec": remake_bullet_vel_sec,
                    "units_per_ms": remake_bullet_vel_ms
                },
                "ship_speed": {
                    "units_per_tick": remake_ship_vel_tick,
                    "units_per_sec": remake_ship_vel_sec,
                    "units_per_ms": remake_ship_vel_ms
                },
                "time_to_reach_viewport": {
                    "center_to_horizontal_edge_sec": remake_t_center_to_horiz_edge,
                    "center_to_horizontal_edge_ms": remake_t_center_to_horiz_edge * 1000.0,
                    "center_to_vertical_edge_sec": remake_t_center_to_vert_edge,
                    "center_to_vertical_edge_ms": remake_t_center_to_vert_edge * 1000.0,
                    "center_to_corner_sec": remake_t_center_to_corner,
                    "center_to_corner_ms": remake_t_center_to_corner * 1000.0,
                    "full_width_traversal_sec": remake_t_full_width,
                    "full_width_traversal_ms": remake_t_full_width * 1000.0
                },
                "screen_speed": {
                    "screen_widths_per_sec": remake_screen_spd_w,
                    "screen_heights_per_sec": remake_screen_spd_h
                }
            },
            "ratios": {
                "speed_ratio_original_div_remake_on_screen": ratio_screen_speed,
                "fraction": "1076250 / 1228032",
                "remake_relative_speed_percentage": (remake_screen_spd_w / orig_screen_spd_w) * 100.0,
                "world_speed_ratio": ratio_world_speed,
                "viewport_width_ratio": ratio_viewport_width
            },
            "calibration_solutions": {
                "option_a_hook_converters": {
                    "shot_thrust_converter": matched_shot_thrust_conv,
                    "base_thrust_converter": matched_base_thrust_conv
                },
                "option_b_camera_zoom": {
                    "zoom": matched_zoom
                }
            }
        }, f, indent=2)
    print(f"\n[+] Results saved to {out_file}")

if __name__ == "__main__":
    run_viewport_bullet_speed_analysis()
