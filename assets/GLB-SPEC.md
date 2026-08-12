# Shoes V2 — GLB delivery specification

Create one single-shoe GLB from each numbered folder using its `front.png`, `back.png`, `left.png`, and `right.png` images.

Expected files:

- `01-orange-shoe/orange-shoe.glb`
- `02-gold-shoe/gold-shoe.glb`
- `03-pastel-shoe/pastel-shoe.glb`

Export requirements:

- One single shoe per GLB; do not create a pair.
- Keep the sole flat and the shoe centered at the world origin.
- Use Y-up orientation.
- Apply/freeze transforms before export: position 0/0/0, rotation 0/0/0, scale 1/1/1.
- Embed PBR textures in the GLB. Use 2K textures where possible.
- Preserve the glossy molded/patent upper, white midsole, dark outsole, and air capsule.
- Prefer fewer than 120,000 triangles and a file size below 15 MB per model.
- Do not include a ground plane, lights, camera, background, skeleton, or baked animation.

The website will create all hover, rotation, floating, and product-swap animation in Three.js.
