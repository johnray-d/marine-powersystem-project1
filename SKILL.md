---
name: blender-threejs-hybrid-modeler
description: Create hybrid 3D CAD and engineering assemblies using Blender Python (bpy) scripts for high-fidelity GLB model generation paired with Three.js / TypeScript controller modules for multi-axis exploded views, live kinematics, and interactive inspection. Use when the user asks to generate a 3D model in Blender and import or control it in Three.js, build a hybrid GLB + Three.js explodable assembly, or automate Blender-to-WebGL workflows for marine, mechanical, or electrical equipment.
---
# Blender + Three.js Hybrid 3D Modeler

Generate production-grade, organic, and mechanically accurate 3D assemblies by combining **Blender Python (`bpy`) scripts** (to build clean, beveled, subdivision-ready geometry and export `.glb` assets) with **Three.js / TypeScript controllers** (to drive real-time multi-axis exploded views, continuous kinematic animations, and click-to-inspect UI).

## When to Use

* The user wants to build a 3D model or explodable assembly using the **hybrid Blender + Three.js workflow**.
* Procedural Three.js geometry alone is too faceted or mathematically rigid (e.g., ship hulls, bulbous bows, hydrofoil propeller blades, cast valve housings, or multi-part engines), and a Blender `.glb` + Three.js pipeline is preferred.
* The user asks for a Blender Python script paired with a Three.js loader, explosion slider binding, animation loop, or IDE integration prompt.

## Steps

### 1. Plan the Mechanical Hierarchy & Coordinate Alignment

Before writing code, align the coordinate systems and object names between Blender and Three.js:

* **Coordinate Mapping**:
  * In Blender (`bpy`), `X` and `Y` are horizontal and `Z` is vertical height.
  * When exported via `bpy.ops.export_scene.gltf(..., export_yup=True)`, Blender automatically converts `+Z Up` to Three.js `+Y Up`.
  * Define a clear origin `(0, 0, 0)` (such as the shaft centerline, mounting flange, or midships waterline) so the `.glb` drops directly into the target Three.js layout without manual offset guesswork.
* **Strict Object Naming Contract**:
  * Every independent sub-assembly created in Blender must have a deterministic, code-friendly `obj.name` (e.g., `Propeller_Hub`, `Propeller_Blade_1`, `Sterntube_Bearing`, `Shaft_Bracket_Cutaway`).
  * Use these exact string keys in the Three.js explosion registry (`Record<string, ComponentMeta>`).

### 2. Author the Blender Python (`bpy`) Generator Script

Write a complete, copy-pasteable Python script for Blender's **Scripting** workspace:

* **Clean Scene Reset**: Start by clearing existing mesh objects and orphan materials so the user can re-run the script iteratively without duplicate objects stacking up.
* **Organic & Beveled Geometry (`BMesh` + Modifiers)**:
  * Use `bmesh` for custom lofted surfaces, hydrofoils, and sectional cutaways (such as a 90-degree quarter-cut housing to expose internal bearings and seals even when assembled).
  * Apply smooth shading (`poly.use_smooth = True`) and attach non-destructive modifiers (`BEVEL` with `limit_method='ANGLE'`, `SMOOTH`, `SOLIDIFY`, or `SUBSURF`) so edges catch specular highlights realistically.
* **PBR Materials & Viewport Preview**:
  * Create `Principled BSDF` materials with realistic metallic, roughness, and alpha values.
  * Always set `mat.diffuse_color = rgba` and configure the 3D Viewport shading to `SOLID` + `MATERIAL` color mode at the bottom of the script so colors and translucency are visible immediately after clicking **Run Script**.
* **Automated `.glb` Export**:
  * Include a configurable `EXPORT_GLB_PATH` at the top of the script and call `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB', use_selection=True, export_apply=True, export_yup=True)`.

### 3. Author the Three.js / TypeScript Hybrid Controller

Write a modular TypeScript class or factory function that loads the `.glb` and brings it to life:

* **Metadata & Explosion Vector Registry**:
  * Define an interface (`ComponentMeta`) with `name`, `category`, `explodeOffset: THREE.Vector3`, and `description`.
  * Map axial parts along the primary shaft/assembly axis (`+X` / `-X` or `+Z` / `-Z`) and radial parts (such as blades, bolts, or covers) outward along radial vectors. Keep the primary housing or bracket anchored at `(0, 0, 0)`.
* **Kinematic Group Separation (`rotatingGroup` vs. `stationaryGroup`)**:
  * When traversing `gltf.scene`, sort meshes into functional sub-groups (e.g., `rotatingGroup` for shafts, hubs, impellers, and keys; `stationaryGroup` for casings, brackets, and bearings) while caching each mesh's resting local position (`partOriginalTransforms`).
* **Smooth Explosion Interpolation**:
  * Implement `setExplosionFactor(factor: number)` (`0.0` to `1.0`) that computes `targetPos = origPos.clone().addScaledVector(meta.explodeOffset, factor)` and smoothly interpolates via `.lerp()`.
* **Live Operational Animation**:
  * Implement `updateRotation(delta: number, rpm: number)` (or linear stroke actuation) on the moving group inside the `requestAnimationFrame` loop.

### 4. Provide UI Bindings & IDE Integration Prompt

When the user is integrating the output into an existing codebase or AI IDE (such as Antigravity, Cursor, or Windsurf):

* **UI Slider & Presets**: Provide the HTML/TypeScript snippet binding an `<input type="range" min="0" max="1" step="0.01">` and preset buttons (`0% Assembled`, `45% Sub-Assy`, `100% Exploded`) to `setExplosionFactor()`.
* **Copy-Paste IDE Prompt**: Provide a structured Markdown prompt instructing the IDE where to place the `.glb` in `public/`, which legacy procedural functions to remove, how to wire the animation loop, and which validation scripts (`npm run check:layout`, `npm run build`) to run.

## Gotchas

* **Blender `export_yup=True` Axis Flip**: Remember that Blender's `(X, Y, Z)` becomes `(X, Z, -Y)` or `(X, Y, Z)` depending on orientation in Three.js. Keep primary shafts aligned along the `X` axis in Blender so they remain on the `X` axis in Three.js.
* **Blender Version API Compatibility**: In Blender 4.0+, `Principled BSDF` renamed `"Transmission"` to `"Transmission Weight"` and material blend modes added `surface_render_method`. Always check `if "Transmission Weight" in bsdf.inputs:` with a fallback to `"Transmission"` so scripts run across all Blender versions without errors.
* **Pivot Points for Radial & Rotating Parts**: If a part rotates in Three.js, ensure its origin in Blender lies exactly on the rotation centerline (`location=(x, 0, 0)`), or place it inside a centered parent `THREE.Group` so it does not wobble eccentrically when spinning.
* **Prevent Internal Hull Protrusions**: When generating internal decks or bulkheads inside a curved hull, dynamically query the hull's half-width at that exact `(X, Z)` coordinate with a 5-7% inward margin rather than using fixed-width rectangular boxes.
