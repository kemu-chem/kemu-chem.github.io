import * as modeling from "@jscad/modeling";

const { booleans, primitives, transforms, extrusions } = modeling;
const { union, subtract } = booleans;
const { cuboid, cylinder, sphere, polygon } = primitives;
const { translate, rotateZ } = transforms;
const { extrudeLinear } = extrusions;

const DOVE_TOP_WIDTH = 4;
const DOVE_ANGLE_DEG = 45;
const DOVE_DEPTH = 6;
const DOVE_CAP = 1;

const degToRad = (deg) => (deg * Math.PI) / 180;

// 2D trapezoid profile in XY plane. Base at X=0, tip at X=depth, symmetric in Y.
// expand > 0 widens the profile (female slot tolerance offset).
const makeDovetailProfile = (topWidth, depth, angleDeg, expand) => {
    const slope = Math.tan(degToRad(angleDeg)) * depth;
    const baseWidth = topWidth + slope * 2;
    const eTop = topWidth + expand * 2;
    const eBase = baseWidth + expand * 2;
    return polygon({
        points: [
            [0,     -eBase / 2],
            [depth,  -eTop / 2],
            [depth,   eTop / 2],
            [0,      eBase / 2]
        ]
    });
};

// Single tube socket bore. Origin convention: Z=0 is body bottom, Z=bodyH is top.
const makeBore = (cx, cy, D, socketDepth, socketBottom, bodyH) => {
    const R = D / 2;
    const eps = 0.02;

    if (socketBottom === "spherical") {
        const cylDepth = Math.max(socketDepth - R, 0);
        const sphereZ = bodyH - cylDepth - R;
        if (cylDepth <= 0) {
            return translate([cx, cy, bodyH - R], sphere({ radius: R }));
        }
        return union(
            translate([cx, cy, bodyH - cylDepth / 2],
                cylinder({ radius: R, height: cylDepth + eps })),
            translate([cx, cy, sphereZ], sphere({ radius: R }))
        );
    }

    return translate(
        [cx, cy, bodyH - socketDepth / 2],
        cylinder({ radius: R, height: socketDepth + eps })
    );
};

export const getParameterDefinitions = () => [
    {
        name: "tube_diameter",
        caption: "Tube diameter (mm)",
        type: "float",
        initial: 16.0,
        min: 5.0,
        max: 80.0,
        step: 0.5
    },
    {
        name: "tube_cols",
        caption: "Columns (X direction)",
        type: "int",
        initial: 4,
        min: 1,
        max: 12,
        step: 1
    },
    {
        name: "tube_rows",
        caption: "Rows (Y direction)",
        type: "int",
        initial: 1,
        min: 1,
        max: 6,
        step: 1
    },
    {
        name: "socket_depth",
        caption: "Socket depth (mm)",
        type: "float",
        initial: 20.0,
        min: 10.0,
        max: 60.0,
        step: 1.0
    },
    {
        name: "socket_bottom",
        caption: "Socket bottom",
        type: "choice",
        values: ["flat", "spherical"],
        captions: ["Flat", "Spherical"],
        initial: "flat"
    },
    {
        name: "wall_thickness",
        caption: "Wall thickness (mm)",
        type: "float",
        initial: 2.5,
        min: 1.5,
        max: 5.0,
        step: 0.1
    },
    {
        name: "tolerance",
        caption: "Tolerance (mm)",
        type: "float",
        initial: 0.1,
        min: 0.05,
        max: 0.3,
        step: 0.05
    }
];

export const main = (params) => {
    const D          = params.tube_diameter;
    const cols       = params.tube_cols;
    const rows       = params.tube_rows;
    const socketDepth = params.socket_depth;
    const socketBottom = params.socket_bottom;
    const W          = params.wall_thickness;
    const tol        = params.tolerance;

    const pitch = D + W;
    const bodyL = cols * pitch + W;   // length in X
    const bodyW = rows * pitch + W;   // width  in Y
    const bodyH = socketDepth + W;    // height in Z

    // Body: centered at X=0, Y=0; bottom at Z=0, top at Z=bodyH
    let body = translate(
        [0, 0, bodyH / 2],
        cuboid({ size: [bodyL, bodyW, bodyH] })
    );

    // Tube socket bores
    const bores = [];
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const cx = -((cols - 1) * pitch) / 2 + c * pitch;
            const cy = -((rows - 1) * pitch) / 2 + r * pitch;
            bores.push(makeBore(cx, cy, D, socketDepth, socketBottom, bodyH));
        }
    }
    body = subtract(body, ...bores);

    // Dovetail connectors — Z-axis drop-in
    //
    // Profile: base at X=0, tip at X=DOVE_DEPTH, symmetric in Y.
    // Extruded along Z. Male height: DOVE_CAP → bodyH-DOVE_CAP.
    //                  Female height: DOVE_CAP → bodyH (open at top).
    //
    // -X face → male   (unit connects to the unit on its left)
    // +X face → female (accepts the male from the unit on its right)
    // -Y face → male   (unit connects to the unit behind it)
    // +Y face → female (accepts the male from the unit in front)

    const maleH   = bodyH - 2 * DOVE_CAP;
    const femaleH = bodyH - DOVE_CAP;

    const maleProf   = makeDovetailProfile(DOVE_TOP_WIDTH, DOVE_DEPTH, DOVE_ANGLE_DEG, 0);
    const femaleProf = makeDovetailProfile(DOVE_TOP_WIDTH, DOVE_DEPTH, DOVE_ANGLE_DEG, tol);

    const maleExtr   = extrudeLinear({ height: maleH   }, maleProf);
    const femaleExtr = extrudeLinear({ height: femaleH }, femaleProf);

    // rotateZ(π):    [x,y] → [-x,-y]  — tip flips to -X direction
    // rotateZ(-π/2): [x,y] → [y,-x]   — tip goes to -Y direction
    // rotateZ(π/2):  [x,y] → [-y,x]   — tip goes to +Y direction

    const eps = 0.01;

    const malePX   = translate([ bodyL / 2,               0, DOVE_CAP], maleExtr);
    const maleNX   = translate([-bodyL / 2 - DOVE_DEPTH,  0, DOVE_CAP], rotateZ(Math.PI,      maleExtr));
    const maleNY   = translate([ 0,        -bodyW / 2 - DOVE_DEPTH, DOVE_CAP], rotateZ(Math.PI / 2, maleExtr));

    const femalePX = translate([ bodyL / 2 - eps,  0, DOVE_CAP], rotateZ(Math.PI,      femaleExtr));
    const femaleNX = translate([-bodyL / 2 + eps,  0, DOVE_CAP], femaleExtr);
    const femalePY = translate([ 0,  bodyW / 2 - eps, DOVE_CAP], rotateZ(-Math.PI / 2, femaleExtr));

    body = union(body, malePX, maleNX, maleNY);
    body = subtract(body, femalePX, femaleNX, femalePY);

    return body;
};