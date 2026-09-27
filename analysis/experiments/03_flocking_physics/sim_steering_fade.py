import numpy as np
import math

def simulate_steering(base_angle, use_fade):
    pos = np.array([0.0, 10.0]) # Ship 10px to the left of cursor
    vel = np.array([0.0, -10.0]) # Moving perfectly up
    mousePos = np.array([0.0, 0.0]) # Cursor at origin
    fleet_angle = -math.pi/2 # Fleet moving UP
    
    path = []
    
    for i in range(20):
        path.append(pos.copy())
        distToMouse = np.linalg.norm(pos - mousePos)
        
        # Cursor is relative, wait, mouse is fixed at origin in this local frame.
        toMouse = mousePos - pos
        rawAngle = math.atan2(toMouse[1], toMouse[0])
        
        angleDiff = (rawAngle - fleet_angle + math.pi) % (2*math.pi) - math.pi
        
        max_angle = base_angle
        if use_fade:
            max_angle = base_angle * np.clip(distToMouse / 60.0, 0.0, 1.0)
            
        clampedDiff = np.clip(angleDiff, -max_angle, max_angle)
        targetAngle = fleet_angle + clampedDiff
        
        # Turn towards target
        currAngle = math.atan2(vel[1], vel[0])
        turnDiff = (targetAngle - currAngle + math.pi) % (2*math.pi) - math.pi
        turn_rate = 0.139
        actual_turn = np.clip(turnDiff, -turn_rate, turn_rate)
        
        newAngle = currAngle + actual_turn
        vel = 7.3 * np.array([math.cos(newAngle), math.sin(newAngle)])
        
        pos += vel
        
    return path

# Test 1: No fade, large angle (Jitter/Tornado)
path1 = simulate_steering(0.25, False)

# Test 2: Fade, small angle (No compaction)
path2 = simulate_steering(0.08, True)

# Test 3: Fade, large angle (Smooth compaction)
path3 = simulate_steering(0.35, True)

def print_path(name, path):
    print(f"--- {name} ---")
    for i, p in enumerate(path):
        print(f"Tick {i:2d}: X={p[0]:5.1f}, Y={p[1]:5.1f}")

print_path("No Fade (0.25)", path1)
print_path("Fade Small (0.08)", path2)
print_path("Fade Large (0.35)", path3)

