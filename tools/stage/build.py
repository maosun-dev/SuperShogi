# 3つの舞台（歌舞伎の舞台・浮世絵の空・金屏風の座敷）の背景の絵を描き出す Blender の台本。
# 流し方は README.md。舞台ごとに 奥（back・不透明）・中（mid・透明あり）・手前（front・透明あり）の3枚と、
# 設定画面の見本（thumb）を public/stages/<舞台>/ に WebP で書き出す。
# 絵の決まり：形は単純な面と立体、質感は色1〜2つ、墨の輪郭線（Freestyle）で芝居絵・浮世絵らしくする。
import math
import os
import sys

import bpy

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'stages')
W, H = 810, 1440           # 縦長の絵（スマホの画面に合わせる。iPhone の幅 430 の約2倍）
W_FULL, H_FULL = W, H      # 置き場所の計算に使う縦横比（荒く描くときも変えない）
SAMPLES = 20
SUMI = '#1D1A17'


# ---------- 色と材質 ----------

def lin(hexstr):
    """'#RRGGBB'（画面の色）→ Blender の材質が使う直線の色"""
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def mat(name, color, rough=0.6, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = lin(color)
        b.inputs['Emission Strength'].default_value = emit
    return m


def stripes(name, colors, width, axis=0, emit=0.0):
    """物体の座標の x（axis=0）か y（axis=1。plane() の板のたて）で、width ごとに colors を順に並べた縞"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.8
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    div = nt.nodes.new('ShaderNodeMath'); div.operation = 'DIVIDE'; div.inputs[1].default_value = width
    nt.links.new(sep.outputs[axis], div.inputs[0])
    flo = nt.nodes.new('ShaderNodeMath'); flo.operation = 'FLOOR'
    nt.links.new(div.outputs[0], flo.inputs[0])
    mod = nt.nodes.new('ShaderNodeMath'); mod.operation = 'FLOORED_MODULO'; mod.inputs[1].default_value = len(colors)
    nt.links.new(flo.outputs[0], mod.inputs[0])
    half = nt.nodes.new('ShaderNodeMath'); half.operation = 'ADD'; half.inputs[1].default_value = 0.5   # 段の真ん中を指して、境目の丸めの誤差を避ける
    nt.links.new(mod.outputs[0], half.inputs[0])
    nrm = nt.nodes.new('ShaderNodeMath'); nrm.operation = 'DIVIDE'; nrm.inputs[1].default_value = len(colors)
    nt.links.new(half.outputs[0], nrm.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    while len(els) < len(colors):
        els.new(0.5)
    for i, c in enumerate(colors):
        els[i].position = i / len(colors)
        els[i].color = lin(c)
    nt.links.new(nrm.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], b.inputs['Base Color'])
    if emit:
        nt.links.new(ramp.outputs[0], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emit
    return m


def gradient_sky(name, stops, lo, hi):
    """たて方向で色が変わる空（光る板）。stops は [(位置0〜1, '#色'), ...]。
    plane() の板はたてが物体の y なので、y の lo〜hi を 0〜1 に写す"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = nt.nodes['Material Output']
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = lo; mr.inputs['From Max'].default_value = hi
    nt.links.new(sep.outputs[1], mr.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    while len(els) < len(stops):
        els.new(0.5)
    for i, (p, c) in enumerate(stops):
        els[i].position = p
        els[i].color = lin(c)
    nt.links.new(mr.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


# ---------- 形 ----------

LAYERS = {'back': [], 'mid': [], 'front': []}


CAM_Y, CAM_Z, LENS, SENSOR = -12.0, 1.0, 30.0, 24.0


def scr(u, v, y):
    """画面の位置（u：左端 -1〜右端 1、v：下端 -1〜上端 1）と奥行き y から、世界の (x, y, z) を返す"""
    hh = (y - CAM_Y) * (SENSOR / 2) / LENS
    hw = hh * W_FULL / H_FULL
    return (u * hw, y, CAM_Z + v * hh)


def keep(obj, layer, m=None, smooth=False):
    if m is not None:
        obj.data.materials.clear()
        obj.data.materials.append(m)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    LAYERS[layer].append(obj)
    return obj


def plane(layer, m, x0, x1, z0, z1, y, cuts=0, rot_x=math.pi / 2):
    bpy.ops.mesh.primitive_plane_add(size=1)
    o = bpy.context.object
    o.scale = (x1 - x0, z1 - z0, 1)
    o.location = ((x0 + x1) / 2, y, (z0 + z1) / 2)
    o.rotation_euler = (rot_x, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if cuts:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.subdivide(number_cuts=cuts)
        bpy.ops.object.mode_set(mode='OBJECT')
    return keep(o, layer, m)


def floor(layer, m, x0, x1, y0, y1, z):
    bpy.ops.mesh.primitive_plane_add(size=1)
    o = bpy.context.object
    o.scale = (x1 - x0, y1 - y0, 1)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, z)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return keep(o, layer, m)


def box(layer, m, loc, size, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    return keep(o, layer, m)


def blob(layer, m, loc, scale, seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, location=loc)
    o = bpy.context.object
    o.scale = scale
    return keep(o, layer, m, smooth=True)


def cyl(layer, m, loc, r, depth, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    return keep(bpy.context.object, layer, m, smooth=True)


def fold(obj, amp, freq, axis=0):
    """布のひだ：x（axis=0）に沿って y を波打たせる"""
    for v in obj.data.vertices:
        v.co.y += amp * math.sin(v.co[axis] * freq) * (0.6 + 0.4 * math.sin(v.co[axis] * freq * 0.37))
    for p in obj.data.polygons:
        p.use_smooth = True


# ---------- 場面の土台 ----------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for k in LAYERS:
        LAYERS[k] = []
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.view_settings.view_transform = 'Standard'   # 色をそのまま出す（AgX だと色が浅くなる）
    sc.view_settings.look = 'None'
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = 'RELATIVE'
    fs = sc.view_layers[0].freestyle_settings
    fs.crease_angle = math.radians(110)
    for old in list(fs.linesets):
        fs.linesets.remove(old)
    ls = fs.linesets.new('ink')
    ls.select_by_visibility = True
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.linestyle = bpy.data.linestyles.new('ink')
    ls.linestyle.color = lin(SUMI)[:3]
    ls.linestyle.thickness = 3.2
    world = bpy.data.worlds.new('world')
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.location = (0, CAM_Y, CAM_Z)
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = LENS
    cam.data.sensor_height = SENSOR
    cam.data.sensor_fit = 'VERTICAL'
    sc.camera = cam
    return sc


def world_color(sc, hexstr, strength):
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = lin(hexstr)
    bg.inputs['Strength'].default_value = strength


def light(kind, loc, energy, color='#FFF4E0', size=2.0, rot=(0, 0, 0), spot_deg=40):
    d = bpy.data.lights.new(kind, kind)
    d.energy = energy
    d.color = lin(color)[:3]
    if kind == 'AREA':
        d.size = size
    if kind == 'SPOT':
        d.spot_size = math.radians(spot_deg)
        d.spot_blend = 0.6
        d.shadow_soft_size = size
    o = bpy.data.objects.new(kind, d)
    o.location = loc
    o.rotation_euler = rot
    bpy.context.scene.collection.objects.link(o)
    return o


def render(sc, path, show, transparent, w=None, h=None):
    w, h = w or W, h or H
    for k, objs in LAYERS.items():
        for o in objs:
            o.hide_render = k not in show
    sc.render.film_transparent = transparent
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    sc.render.image_settings.quality = 82
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def write_all(sc, name):
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    render(sc, os.path.join(d, 'back.webp'), {'back'}, False)
    render(sc, os.path.join(d, 'mid.webp'), {'mid'}, True)
    render(sc, os.path.join(d, 'front.webp'), {'front'}, True)
    render(sc, os.path.join(d, 'thumb.webp'), {'back', 'mid', 'front'}, False, 270, 480)


# ---------- 歌舞伎の舞台 ----------
# 画面の真ん中（v が -0.35〜0.45 くらい）は対局の盤が乗るので、見せ場は上と下に置く

def seg(layer, m, a, b, r, verts=10):
    """2点 a・b（x, y, z）を結ぶ細い円柱（枝・幹）"""
    mx, my, mz = [(a[i] + b[i]) / 2 for i in range(3)]
    dx, dz = b[0] - a[0], b[2] - a[2]
    cyl(layer, m, (mx, my, mz), r, math.hypot(dx, dz), rot=(0, math.atan2(dx, dz), 0), verts=verts)


def disc(layer, m, loc, r):
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=r, fill_type='NGON', location=loc, rotation=(math.radians(90), 0, 0))
    return keep(bpy.context.object, layer, m)


def kabuki():
    sc = reset()
    world_color(sc, '#6A4A30', 0.5)
    # 奥：定式幕（黒・柿・萌葱）。ひだを付けた布。少し自ら光らせて沈ませない
    curtain = plane('back', stripes('joshiki', ['#26201B', '#A9542A', '#3D6E3A'], 0.85, emit=0.04), -6, 6, -1.6, 8, 3.0, cuts=60)
    fold(curtain, 0.16, 7.0)
    # 上の一文字幕：紅に金の縁と、白抜きの紋（丸）
    _, _, z0 = scr(0, 0.62, 2.4)
    plane('back', mat('ichimonji', '#C21F37', 0.7, emit=0.1), -6, 6, z0, 8, 2.4)
    plane('back', mat('kin_fuchi', '#E2B24A', 0.35, 0.8), -6, 6, z0 - 0.22, z0, 2.35)
    mon = mat('mon', '#F6EEDC', 0.6, emit=0.2)
    naka = mat('mon_naka', '#C21F37', 0.6)
    for u in (-0.6, 0.0, 0.6):
        x, y, z = scr(u, 0.8, 2.3)
        disc('back', mon, (x, y, z), 0.42)
        disc('back', naka, (x, y - 0.01, z), 0.26)
    # 床：明るい檜の板（奥へ向かう板目）
    floor('back', stripes('hinoki', ['#EBCB93', '#E2BE80', '#EFD3A1', '#DDB577'], 0.55), -9, 9, -14, 3.2, -1.6)
    plane('back', mat('kage', '#3A2618', 0.9), -6, 6, -1.6, -1.4, 2.9)
    # 中：両脇の柱（黒漆と金具）と、一文字幕の下に吊る提灯の列
    for u in (-0.93, 0.93):
        x, y, _ = scr(u, 0, 0.5)
        box('mid', mat('hashira', '#2A1C14', 0.35), (x, y, 2.6), (0.38, 0.38, 12.0))
        for v in (0.55, -0.55):
            box('mid', mat('kanagu', '#E2B24A', 0.3, 0.9), (x, y, scr(0, v, 0.5)[2]), (0.44, 0.44, 0.14))
    chochin = mat('chochin', '#FBF1DA', 0.5, emit=2.2)
    wa = mat('chochin_wa', '#1D1A17', 0.5)
    obi = mat('chochin_obi', '#C21F37', 0.6)
    for i, u in enumerate([-0.72, -0.43, -0.14, 0.14, 0.43, 0.72]):
        x, y, z = scr(u, 0.5 - (0.03 if i % 2 else 0), 1.0)
        cyl('mid', chochin, (x, y, z), 0.26, 0.6)
        for dz in (-0.33, 0.33):
            cyl('mid', wa, (x, y, z + dz), 0.21, 0.07)
        cyl('mid', obi, (x, y, z), 0.265, 0.13)
        cyl('mid', wa, (x, y, z + 0.7), 0.012, 0.75, verts=6)
    # 手前：左上から垂れる梅の枝と、下の舞台の縁（黒い框に金の鋲）
    eda = mat('ume_eda', '#2A1B12', 0.8)
    pts = [scr(-1.1, 1.05, -5.0), scr(-0.75, 0.88, -5.0), scr(-0.45, 0.93, -5.0), scr(-0.15, 0.8, -5.0)]
    for p0, p1 in zip(pts, pts[1:]):
        seg('front', eda, p0, p1, 0.05)
    seg('front', eda, scr(-0.75, 0.88, -5.0), scr(-0.6, 0.74, -5.0), 0.035)
    hana = mat('ume', '#E07A96', 0.5)
    shin = mat('ume_shin', '#E2B24A', 0.4, 0.6)
    for (u, v) in [(-0.9, 0.95), (-0.68, 0.9), (-0.52, 0.97), (-0.36, 0.86), (-0.6, 0.76), (-0.2, 0.83), (-0.82, 0.83)]:
        x, y, z = scr(u, v, -5.1)
        blob('front', hana, (x, y, z), (0.12, 0.05, 0.12), seg=12)
        blob('front', shin, (x, y - 0.05, z), (0.035, 0.02, 0.035), seg=8)
    _, y, z = scr(0, -0.97, -4.0)
    box('front', mat('kamachi', '#2A1C14', 0.35), (0, y, z), (14, 0.4, 0.36))
    byo = mat('byo', '#E2B24A', 0.3, 0.9)
    for u in (-0.8, -0.4, 0.0, 0.4, 0.8):
        bx, by, bz = scr(u, -0.97, -4.25)
        blob('front', byo, (bx, by, bz), (0.07, 0.04, 0.07), seg=10)
    # 光：上からのスポットライト（中央を明るく）と、客席からの明るい光
    light('SPOT', (0, -3.5, 9.5), 5200, '#FFF4E0', 1.5, (math.radians(30), 0, 0), 60)
    light('AREA', (0, -11, 2.5), 2600, '#FFEBD0', 12, (math.radians(90), 0, 0))
    light('AREA', (0, -2, 9), 900, '#FFE6C0', 10)
    write_all(sc, 'kabuki')


# ---------- 浮世絵の空 ----------

def ukiyoe():
    sc = reset()
    world_color(sc, '#D8EEF4', 0.9)
    # 奥：天の藍から浅葱、地平の生成りへ抜ける空（板のたては y の -11.5〜11.5）
    plane('back', gradient_sky('sora', [(0.0, '#F6EEDB'), (0.35, '#CDEAF0'), (0.62, '#7CC0DE'), (0.86, '#3576B4'), (1.0, '#24508E')], -11.5, 11.5), -12, 12, -9, 14, 6.0)
    # 紅の日輪（右上）
    disc('back', mat('hi', '#D7263D', 0.5, emit=1.0), scr(0.48, 0.66, 5.5), 0.9)
    # 遠くの山（白い頂）：画面の下寄りに小さく
    x, y, z = scr(-0.25, -0.62, 5.0)
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=4.0, depth=3.2, location=(x, y, z + 1.6))
    keep(bpy.context.object, 'back', mat('yama', '#5B7DA8', 0.9), smooth=True)
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=1.3, depth=1.05, location=(x, y - 0.03, z + 2.68))
    keep(bpy.context.object, 'back', mat('yuki', '#FBF6EA', 0.8, emit=0.2), smooth=True)
    # 中：墨の輪郭の雲（平たい玉を重ねる）
    kumo = mat('kumo', '#FCF8EE', 0.9, emit=0.25)

    def cloud(layer, u, v, y, n, wu, s=1.0):
        cx, cy, cz = scr(u, v, y)
        w = wu * scr(1, 0, y)[0]
        for i in range(n):
            t = i / max(1, n - 1)
            k = (0.5 + 0.35 * math.sin(t * math.pi)) * s
            blob(layer, kumo, (cx - w / 2 + w * t, cy, cz + 0.1 * math.sin(i * 1.7) * s), (k, 0.22, k * 0.6))
    cloud('mid', -0.62, 0.84, 1.5, 4, 0.9)
    cloud('mid', 0.75, 0.42, 1.2, 3, 0.6, 0.8)
    cloud('mid', -0.8, 0.12, 1.0, 3, 0.55, 0.8)
    for k, v in enumerate([-0.58, -0.76, -0.95]):
        cloud('mid', 0.05 * (k - 1), v, 0.5 - k * 0.5, 10, 2.4, 1.15)
    # 手前：大きな雲と、渡る鶴（白い体に墨の翼の先）
    cloud('front', -0.75, -0.92, -5.0, 4, 0.9, 0.7)
    cloud('front', 0.85, 0.98, -5.0, 3, 0.7, 0.6)
    shiro = mat('tsuru', '#FBF6EA', 0.7, emit=0.3)
    kuro = mat('tsuru_saki', '#1D1A17', 0.8)
    for (u, v, s) in [(0.05, 0.62, 1.0), (0.24, 0.55, 0.8), (-0.12, 0.54, 0.7)]:
        x, y, z = scr(u, v, -3.0)
        for side in (-1, 1):
            box('front', shiro, (x + side * 0.16 * s, y, z), (0.32 * s, 0.02, 0.06 * s), rot=(0, math.radians(-side * 20), 0))
            box('front', kuro, (x + side * 0.34 * s, y - 0.01, z + 0.07 * s), (0.1 * s, 0.02, 0.06 * s), rot=(0, math.radians(-side * 20), 0))
        blob('front', shiro, (x, y, z), (0.07 * s, 0.03, 0.04 * s), seg=10)
    light('SUN', (0, 0, 10), 3.4, '#FFF7E8', rot=(math.radians(35), math.radians(-15), 0))
    write_all(sc, 'ukiyoe')


# ---------- 金屏風の座敷 ----------

def byobu():
    sc = reset()
    world_color(sc, '#E8DDC4', 0.55)
    # 奥：壁と、上の長押・欄間（黒い木の格子）
    plane('back', mat('kabe', '#E6D8B8', 0.95), -9, 9, -1.6, 9, 4.2)
    _, _, ztop = scr(0, 0.62, 4.0)
    box('back', mat('nageshi', '#2A1B12', 0.5), (0, 4.0, ztop), (14, 0.3, 0.3))
    koshi = mat('ranma', '#3A2A1C', 0.5)
    for i in range(-8, 9):
        box('back', koshi, (i * 0.45, 4.05, ztop + 0.9), (0.06, 0.06, 1.5))
    box('back', koshi, (0, 4.05, ztop + 1.65), (14, 0.08, 0.1))
    # 六曲の金屏風（折れ目でジグザグ）
    kin = mat('kinpaku', '#D9AE3C', 0.3, 0.9)
    waku = mat('waku', '#1D1A17', 0.4)
    panel_w, top, bottom = 1.2, 3.4, -1.6
    for i in range(6):
        x = -3.6 + panel_w * (i + 0.5)
        ang = math.radians(16 if i % 2 == 0 else -16)
        box('back', kin, (x, 2.6, (top + bottom) / 2), (panel_w * 1.02, 0.05, top - bottom), rot=(0, 0, ang))
        box('back', waku, (x, 2.55, top + 0.06), (panel_w * 1.02, 0.08, 0.12), rot=(0, 0, ang))
    # 屏風の松：幹（墨）と、葉の塊（緑青）
    miki = mat('miki', '#3A2A1C', 0.8)
    for a2, b2 in [((-2.8, -1.4), (-2.2, 0.6)), ((-2.2, 0.6), (-1.0, 1.6)), ((-1.0, 1.6), (0.6, 2.0)), ((-2.2, 0.6), (-2.9, 2.2)), ((0.6, 2.0), (2.0, 1.7))]:
        seg('back', miki, (a2[0], 2.42, a2[1]), (b2[0], 2.42, b2[1]), 0.12)
    ha = mat('matsu', '#3D7A62', 0.7)
    for (x, z, s) in [(-1.1, 1.9, 0.75), (0.5, 2.25, 0.85), (-2.9, 2.45, 0.6), (1.7, 1.95, 0.6), (-0.3, 2.75, 0.5), (2.4, 1.6, 0.45)]:
        blob('back', ha, (x, 2.35, z), (s, 0.12, s * 0.45))
    # 床：畳（い草の色）と黒い縁
    floor('back', stripes('igusa', ['#CFC98F', '#C6C084'], 0.06, axis=0), -9, 9, -14, 2.4, -1.6)
    heri = mat('heri', '#22301F', 0.7)
    for y in (-8.0, -4.0, 0.0):
        box('back', heri, (0, y, -1.58), (18, 0.14, 0.02))
    for x in (-4.0, 0.0, 4.0):
        box('back', heri, (x, -5.0, -1.58), (0.14, 14, 0.02))
    # 中：左の床柱（白木）
    x, y, _ = scr(-0.95, 0, 1.0)
    box('mid', mat('tokobashira', '#D8BE8E', 0.6), (x, y, 2.6), (0.34, 0.34, 12.0))
    # 手前：上から下がる簾（細い竹の横縞）と、紅の房
    _, y, z0 = scr(0, 0.86, -5.0)
    _, _, z1 = scr(0, 1.05, -5.0)
    plane('front', stripes('sudare', ['#C9A86C', '#A88650'], 0.045, axis=1), -3, 3, z0, z1, y)
    box('front', mat('sudare_fuchi', '#2A1B12', 0.5), (0, y - 0.02, z0), (6, 0.04, 0.08))
    fusa = mat('fusa', '#B0172E', 0.6)
    tama = mat('fusa_tama', '#E2B24A', 0.3, 0.8)
    for u in (-0.55, 0.55):
        x, yy, z = scr(u, 0.8, -5.1)
        cyl('front', fusa, (x, yy, z), 0.05, 0.32, verts=12)
        blob('front', tama, (x, yy, z + 0.18), (0.06, 0.06, 0.06), seg=10)
    # 光：障子越しのやわらかい光（左上）と、手前からの光
    light('AREA', (-6, -4, 7), 1100, '#FFF3DE', 6, (math.radians(55), math.radians(-35), 0))
    light('AREA', (3, -9, 2), 900, '#FFE9C8', 8, (math.radians(90), 0, 0))
    write_all(sc, 'byobu')


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    which = argv or ['kabuki', 'ukiyoe', 'byobu']
    if '--fast' in which:
        SAMPLES, W, H = 8, 270, 480
        which = [w for w in which if w != '--fast'] or ['kabuki', 'ukiyoe', 'byobu']
    for name in which:
        {'kabuki': kabuki, 'ukiyoe': ukiyoe, 'byobu': byobu}[name]()
        print('書き出しました', name)
