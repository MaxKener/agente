"""
Aplicación Flask para VISUALIZAR modelo ya entrenado
Versión con sistema de 3 NIVELES
Universidad Nacional del Altiplano - Puno
Aprendizaje de Máquina
"""

from flask import Flask, render_template, jsonify, request
import json
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import random
import os

app = Flask(__name__)

# ============================================================================
# CARGAR DATOS DE ENTRENAMIENTO
# ============================================================================

def load_training_data():
    data_path = os.path.join(os.path.dirname(__file__), 'training_results.json')
    try:
        with open(data_path, 'r') as f:
            data = json.load(f)
        print("✅ Datos de entrenamiento cargados")
        return data
    except:
        return {'rewards': [], 'scores': [], 'losses': [], 'epsilons': []}

TRAINING_DATA = load_training_data()

# ============================================================================
# RED NEURONAL DQN
# ============================================================================

class DQNNetwork(nn.Module):
    def __init__(self, state_size, action_size):
        super(DQNNetwork, self).__init__()
        self.fc1 = nn.Linear(state_size, 256)
        self.fc2 = nn.Linear(256, 256)
        self.fc3 = nn.Linear(256, 128)
        self.fc4 = nn.Linear(128, 64)
        self.fc5 = nn.Linear(64, action_size)
        self.dropout = nn.Dropout(0.2)
    
    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = F.relu(self.fc2(x))
        x = self.dropout(x)
        x = F.relu(self.fc3(x))
        x = F.relu(self.fc4(x))
        return self.fc5(x)

# Cargar modelo
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"📱 Dispositivo: {device}")

model = DQNNetwork(state_size=9, action_size=3).to(device)
MODEL_LOADED = False

model_path = os.path.join(os.path.dirname(__file__), 'breakout_dqn_trained.pth')
try:
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model.eval()
    MODEL_LOADED = True
    print("✅ Modelo cargado")
except:
    try:
        model.load_state_dict(torch.load(model_path, map_location=device))
        model.eval()
        MODEL_LOADED = True
        print("✅ Modelo cargado (legacy)")
    except Exception as e:
        print(f"⚠️  Error: {e}")

# ============================================================================
# CONFIGURACIÓN DE NIVELES
# ============================================================================

LEVEL_CONFIG = {
    1: {
        'rows': 5,
        'cols': 8,
        'ball_speed': 6,
        'paddle_width': 100,
        'paddle_speed': 16,
        'brick_width': 78,
        'brick_height': 24,
    },
    2: {
        'rows': 6,
        'cols': 8,
        'ball_speed': 7,
        'paddle_width': 85,
        'paddle_speed': 18,
        'brick_width': 78,
        'brick_height': 22,
    },
    3: {
        'rows': 7,
        'cols': 8,
        'ball_speed': 8,
        'paddle_width': 70,
        'paddle_speed': 20,
        'brick_width': 78,
        'brick_height': 20,
    }
}

# ============================================================================
# ENTORNO BREAKOUT CON NIVELES
# ============================================================================

class BreakoutEnv:
    def __init__(self, level=1):
        self.width = 700
        self.height = 600
        
        # Cargar configuración del nivel
        config = LEVEL_CONFIG.get(level, LEVEL_CONFIG[1])
        
        self.level = level
        self.paddle_width = config['paddle_width']
        self.paddle_height = 14
        self.paddle_speed = config['paddle_speed']
        
        self.ball_radius = 8
        self.ball_speed = config['ball_speed']
        
        self.brick_rows = config['rows']
        self.brick_cols = config['cols']
        self.brick_width = config['brick_width']
        self.brick_height = config['brick_height']
        self.brick_padding = 6
        self.brick_offset_top = 60
        
        # Calcular offset left para centrar ladrillos
        total_brick_width = self.brick_cols * (self.brick_width + self.brick_padding) - self.brick_padding
        self.brick_offset_left = (self.width - total_brick_width) // 2
        
        self.reset()
    
    def reset(self):
        self.paddle_x = self.width // 2 - self.paddle_width // 2
        self.paddle_y = self.height - 40
        
        self.ball_x = float(self.width // 2)
        self.ball_y = float(self.height - 80)
        
        angle = random.uniform(-0.5, 0.5)
        self.ball_dx = self.ball_speed * angle
        self.ball_dy = -self.ball_speed
        
        # Crear ladrillos
        self.bricks = []
        for row in range(self.brick_rows):
            for col in range(self.brick_cols):
                brick_x = col * (self.brick_width + self.brick_padding) + self.brick_offset_left
                brick_y = row * (self.brick_height + self.brick_padding) + self.brick_offset_top
                self.bricks.append({
                    'x': brick_x,
                    'y': brick_y,
                    'width': self.brick_width,
                    'height': self.brick_height,
                    'active': True,
                    'row': row
                })
        
        self.score = 0
        self.lives = 3
        self.done = False
        
        return self._get_state()
    
    def _get_state(self):
        bricks_left = sum(1 for b in self.bricks if b['active'])
        total_bricks = self.brick_rows * self.brick_cols
        
        active_bricks = [b for b in self.bricks if b['active']]
        if active_bricks:
            closest = min(active_bricks,
                key=lambda b: abs(b['x'] + self.brick_width/2 - self.ball_x) + 
                             abs(b['y'] + self.brick_height/2 - self.ball_y))
            brick_dist_x = (closest['x'] + self.brick_width/2 - self.ball_x) / self.width
            brick_dist_y = (closest['y'] + self.brick_height/2 - self.ball_y) / self.height
        else:
            brick_dist_x = 0
            brick_dist_y = 0
        
        paddle_center = self.paddle_x + self.paddle_width / 2
        paddle_ball_dist = (paddle_center - self.ball_x) / self.width
        
        return np.array([
            self.paddle_x / self.width,
            self.ball_x / self.width,
            self.ball_y / self.height,
            self.ball_dx / (2 * self.ball_speed),
            self.ball_dy / (2 * self.ball_speed),
            bricks_left / total_bricks,
            paddle_ball_dist,
            brick_dist_x,
            brick_dist_y,
        ], dtype=np.float32)
    
    def step(self, action):
        # Mover paddle
        if action == 0 and self.paddle_x > 0:
            self.paddle_x = max(0, self.paddle_x - self.paddle_speed)
        elif action == 2 and self.paddle_x < self.width - self.paddle_width:
            self.paddle_x = min(self.width - self.paddle_width, self.paddle_x + self.paddle_speed)
        
        # Mover pelota
        self.ball_x += self.ball_dx
        self.ball_y += self.ball_dy
        
        # Colisión paredes
        if self.ball_x - self.ball_radius <= 0:
            self.ball_dx = abs(self.ball_dx)
            self.ball_x = self.ball_radius
        elif self.ball_x + self.ball_radius >= self.width:
            self.ball_dx = -abs(self.ball_dx)
            self.ball_x = self.width - self.ball_radius
        
        if self.ball_y - self.ball_radius <= 0:
            self.ball_dy = abs(self.ball_dy)
            self.ball_y = self.ball_radius
        
        # Colisión paddle
        if (self.ball_y + self.ball_radius >= self.paddle_y and
            self.ball_y - self.ball_radius <= self.paddle_y + self.paddle_height and
            self.ball_x >= self.paddle_x - self.ball_radius and
            self.ball_x <= self.paddle_x + self.paddle_width + self.ball_radius and
            self.ball_dy > 0):
            
            self.ball_dy = -abs(self.ball_dy)
            hit_pos = (self.ball_x - self.paddle_x) / self.paddle_width
            self.ball_dx = self.ball_speed * (hit_pos - 0.5) * 2.5
            self.ball_dx = max(-self.ball_speed * 1.3, min(self.ball_speed * 1.3, self.ball_dx))
            self.ball_y = self.paddle_y - self.ball_radius - 1
        
        # Colisión ladrillos
        for brick in self.bricks:
            if brick['active']:
                if (self.ball_x + self.ball_radius >= brick['x'] and
                    self.ball_x - self.ball_radius <= brick['x'] + brick['width'] and
                    self.ball_y + self.ball_radius >= brick['y'] and
                    self.ball_y - self.ball_radius <= brick['y'] + brick['height']):
                    
                    brick['active'] = False
                    self.score += 10
                    
                    # Determinar lado de colisión
                    overlap_left = (self.ball_x + self.ball_radius) - brick['x']
                    overlap_right = (brick['x'] + brick['width']) - (self.ball_x - self.ball_radius)
                    overlap_top = (self.ball_y + self.ball_radius) - brick['y']
                    overlap_bottom = (brick['y'] + brick['height']) - (self.ball_y - self.ball_radius)
                    
                    min_overlap = min(overlap_left, overlap_right, overlap_top, overlap_bottom)
                    
                    if min_overlap == overlap_top or min_overlap == overlap_bottom:
                        self.ball_dy = -self.ball_dy
                    else:
                        self.ball_dx = -self.ball_dx
                    
                    break
        
        # Pelota cayó
        if self.ball_y + self.ball_radius >= self.height:
            self.lives -= 1
            if self.lives <= 0:
                self.done = True
            else:
                self.ball_x = float(self.width // 2)
                self.ball_y = float(self.height - 80)
                angle = random.uniform(-0.5, 0.5)
                self.ball_dx = self.ball_speed * angle
                self.ball_dy = -self.ball_speed
        
        # Victoria del nivel
        if all(not brick['active'] for brick in self.bricks):
            self.done = True
        
        return self._get_state(), self.done
    
    def get_game_state(self):
        return {
            'paddle': {
                'x': int(self.paddle_x),
                'y': int(self.paddle_y),
                'width': self.paddle_width,
                'height': self.paddle_height
            },
            'ball': {
                'x': round(self.ball_x, 1),
                'y': round(self.ball_y, 1),
                'radius': self.ball_radius
            },
            'bricks': [
                {
                    'x': b['x'],
                    'y': b['y'],
                    'width': b['width'],
                    'height': b['height'],
                    'active': b['active'],
                    'row': b['row']
                } for b in self.bricks
            ],
            'score': self.score,
            'lives': self.lives,
            'level': self.level
        }


# Estado global
demo_env = None
demo_running = False
current_level = 1

# ============================================================================
# RUTAS FLASK
# ============================================================================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/training_data')
def get_training_data():
    return jsonify(TRAINING_DATA)


@app.route('/api/start_demo')
def start_demo():
    global demo_env, demo_running, current_level
    
    if not MODEL_LOADED:
        return jsonify({'error': 'Modelo no cargado', 'success': False}), 400
    
    level = request.args.get('level', 1, type=int)
    level = max(1, min(3, level))  # Limitar entre 1 y 3
    
    current_level = level
    demo_env = BreakoutEnv(level=level)
    demo_running = True
    
    return jsonify({
        'success': True, 
        'level': level,
        'config': LEVEL_CONFIG[level]
    })


@app.route('/api/demo_step')
def demo_step():
    global demo_env, demo_running
    
    if not demo_running or demo_env is None:
        return jsonify({'done': True, 'game_state': None})
    
    state = demo_env._get_state()
    state_tensor = torch.FloatTensor(state).unsqueeze(0).to(device)
    
    with torch.no_grad():
        q_values = model(state_tensor)
    action = q_values.argmax().item()
    
    next_state, done = demo_env.step(action)
    
    if done:
        demo_running = False
    
    return jsonify({
        'game_state': demo_env.get_game_state(),
        'done': done,
        'action': action
    })


@app.route('/api/stop_demo')
def stop_demo():
    global demo_running
    demo_running = False
    return jsonify({'success': True})


@app.route('/api/stats')
def get_stats():
    if not TRAINING_DATA.get('rewards'):
        return jsonify({
            'total_episodes': 0,
            'best_reward': 0,
            'best_score': 0,
            'avg_score': 0,
            'final_epsilon': 1.0,
            'victories': 0,
            'model_loaded': MODEL_LOADED
        })
    
    rewards = TRAINING_DATA['rewards']
    scores = TRAINING_DATA.get('scores', [0])
    epsilons = TRAINING_DATA.get('epsilons', [1.0])
    
    return jsonify({
        'total_episodes': len(rewards),
        'best_reward': float(max(rewards)) if rewards else 0,
        'best_score': int(max(scores)) if scores else 0,
        'avg_score': float(np.mean(scores)) if scores else 0,
        'final_epsilon': float(epsilons[-1]) if epsilons else 1.0,
        'victories': sum(1 for s in scores if s >= 400),
        'model_loaded': MODEL_LOADED
    })


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print("\n" + "="*70)
    print("🎮 BREAKOUT DQN - Sistema de 3 Niveles")
    print("📍 Universidad Nacional del Altiplano - Puno")
    print("="*70)
    
    if MODEL_LOADED:
        print("\n✅ Modelo DQN cargado")
        print(f"✅ Episodios: {len(TRAINING_DATA.get('rewards', []))}")
    else:
        print("\n⚠️  Modelo no encontrado")
    
    print("\n🌐 http://localhost:5000")
    print("⚡ Ctrl+C para detener\n")
    
    app.run(debug=False, host='0.0.0.0', port=5000, threaded=True)
