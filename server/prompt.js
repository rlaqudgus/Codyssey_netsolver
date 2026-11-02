// Instruction sent to Claude with the photo. Edit here to improve recognition.
export function buildPrompt(memo) {
  return `You are analyzing a photo of a Korean aptitude-test (인적성) spatial reasoning problem: a net (전개도) of a regular polyhedron and answer options that show faces of the folded solid. The photo may be rotated, tilted or skewed. First work out the upright orientation of the printed page from its text, then describe everything in that upright orientation (y axis pointing up the page).

Reply with ONLY one JSON object:
{
 "solid": "tetrahedron" | "cube" | "octahedron",
 "questionType": "can" | "cannot",   // "can": choose the option that CAN be made; "cannot": choose the one that CANNOT
 "question": "short Korean summary of what is asked",
 "net": {"faces": [{"id": "가", "lattice": [[i,j], ...], "pattern": [ ... ]}]},
 "options": [{"label": "①", "faces": [{"pts": [[x,y], ...], "pattern": [ ... ]}], "verdict": true|false, "reason": "Korean, 1-3 sentences"}],
 "answer": "③",
 "principle": ["Korean step", "..."],   // 3-5 short steps explaining how to solve this kind of problem, specific to this net
 "confidence": "high" | "medium" | "low",
 "readingNotes": "Korean: anything in the photo you were unsure about, or empty string"
}

Net coordinates:
- cube: vertex [i,j] is the integer grid point (i, j); every face is a unit square.
- tetrahedron / octahedron (equilateral triangles of side 1): vertex [i,j] means the point (i + j/2, j*sqrt(3)/2).
- y points up the page. List each face's vertices counter-clockwise. Faces that share an edge must use identical lattice points. Use ids 가, 나, 다, ... for faces.

Option coordinates:
- pts are approximate 2D coordinates (y up, any scale) of each face exactly as drawn in the option. List vertices counter-clockwise. Vertices shared between faces must have identical coordinates. Include only the faces the option shows (for a cube view, the 3 visible faces are parallelograms; for a tetrahedron it is often 2 triangles sharing an edge).

Pattern primitives (drawn in order on a white face with a black outline). Every position is a list of weights over that face's own vertex list (same order as listed, weights sum to 1):
- {"t":"poly","fill":"black"|"white"|"gray","p":[[w...],[w...],...]}
- {"t":"circle","c":[w...],"r":radius as a fraction of the face edge length,"fill":"black"|"white"|"none"}  (outline always drawn)
- {"t":"line","a":[w...],"b":[w...]}
- {"t":"text","c":[w...],"s":"A","size":fraction of edge,"angle":degrees}  (angle 0 = baseline parallel to the direction from vertex 0 to vertex 1, letter upright when that direction points right)
Examples for a triangle face: black corner triangle at vertex 0 reaching the two edge midpoints: {"t":"poly","fill":"black","p":[[1,0,0],[0.5,0.5,0],[0.5,0,0.5]]}. A curved black corner between vertex 0 and the inscribed circle: that corner triangle, then {"t":"circle","c":[0.3333,0.3333,0.3334],"r":0.2887,"fill":"white"}. Black triangle joining the three edge midpoints: {"t":"poly","fill":"black","p":[[0.5,0.5,0],[0,0.5,0.5],[0.5,0,0.5]]}. For a square face, weights have 4 entries.

Accuracy matters more than speed. For every face check exactly which vertex or edge each mark touches and which way asymmetric marks point. Describe the same mark the same way in the net and in the options, because the page compares the drawings pixel by pixel after folding. The net is folded with the printed side outward. When judging the options, check both where marks sit and whether the option is a mirror image (mirror images cannot be made).` + (memo ? `

The user checked a previous reading and adds this correction (trust it over your own reading where they conflict):
${memo}` : '');
}
