import math
import matplotlib.pyplot as plt

# Simulate 5 ships steering towards a cursor

class Ship:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.vx = 0
        self.vy = 0
        self.angle = 0

def simulate():
    ships = [
        Ship(30, 0), Ship(10, 20), Ship(-10, -20), Ship(-30, 10), Ship(0, -30)
    ]
    
    cursor_x, cursor_y = 0, 0
    solid_dia = 18.0
    turn_rate = 0.1393
    speed = 10.0
    
    history_x = [[] for _ in ships]
    history_y = [[] for _ in ships]
    
    for step in range(200):
        # 1. Steering
        for i, s in enumerate(ships):
            # Target vector
            tx = cursor_x - s.x
            ty = cursor_y - s.y
            dist = math.hypot(tx, ty)
            
            if dist > 0.1:
                target_angle = math.atan2(ty, tx)
                # clamp turn
                diff = (target_angle - s.angle + math.pi) % (math.pi*2) - math.pi
                diff = max(-turn_rate, min(turn_rate, diff))
                s.angle += diff
            
            s.vx = math.cos(s.angle) * speed
            s.vy = math.sin(s.angle) * speed
            
            s.x += s.vx
            s.y += s.vy
        
        # 2. PBD Relaxation
        for _ in range(2):
            dx = [0]*len(ships)
            dy = [0]*len(ships)
            w = [0]*len(ships)
            
            for i in range(len(ships)):
                for j in range(i+1, len(ships)):
                    rx = ships[j].x - ships[i].x
                    ry = ships[j].y - ships[i].y
                    d = math.hypot(rx, ry)
                    if 0.001 < d < solid_dia:
                        overlap = solid_dia - d
                        smooth = 1.0 - (d / solid_dia)
                        push = overlap * 0.5 * 0.6 * (0.5 + 0.5 * smooth)
                        px = (rx/d) * push
                        py = (ry/d) * push
                        
                        dx[i] -= px
                        dy[i] -= py
                        dx[j] += px
                        dy[j] += py
                        w[i] += 1
                        w[j] += 1
            
            for i in range(len(ships)):
                if w[i] > 0:
                    ships[i].x += dx[i] / max(1, math.sqrt(w[i]))
                    ships[i].y += dy[i] / max(1, math.sqrt(w[i]))
                    
        for i, s in enumerate(ships):
            history_x[i].append(s.x)
            history_y[i].append(s.y)

    for i in range(len(ships)):
        plt.plot(history_x[i], history_y[i])
    plt.plot([0], [0], 'kx')
    plt.savefig('compaction.png')

if __name__ == "__main__":
    simulate()
