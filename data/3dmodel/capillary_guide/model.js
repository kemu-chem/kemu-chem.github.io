import * as modeling from "@jscad/modeling";

const { booleans, primitives, transforms } = modeling;

const { union, subtract } = booleans;
const { cylinder, cuboid } = primitives;
const { translate, rotateZ } = transforms;

const NEEDLE_18G_OD = 1.27;

export const getParameterDefinitions = () => [
    {
        name: "capillary_od",
        caption: "Capillary OD (mm)",
        type: "float",
        initial: 1.1,
        min: 0.5,
        max: 2.0,
        step: 0.05
    },
    {
        name: "guide_length",
        caption: "Guide length (mm)",
        type: "float",
        initial: 20.0,
        min: 10.0,
        max: 50.0,
        step: 0.1
    },
    {
        name: "grip_diameter",
        caption: "Grip diameter (mm)",
        type: "float",
        initial: 8.0,
        min: 5.0,
        max: 15.0,
        step: 0.1
    },
    {
        name: "tolerance",
        caption: "Tolerance (mm)",
        type: "float",
        initial: 0.1,
        min: 0.05,
        max: 0.2,
        step: 0.05
    }
];

export const main = (params) => {
    const capillaryOd = params.capillary_od;
    const guideLength = params.guide_length;
    const gripDiameter = params.grip_diameter;
    const tolerance = params.tolerance;

    const needleBoreDiameter = NEEDLE_18G_OD + tolerance;
    const capillaryBoreDiameter = capillaryOd + tolerance;

    const needleLength = guideLength * 0.45;
    const capillaryLength = guideLength - needleLength;

    const body = cylinder({ height: guideLength, radius: gripDiameter / 2 });

    const needleBore = translate(
        [0, 0, -guideLength / 2 + needleLength / 2],
        cylinder({ height: needleLength + 1, radius: needleBoreDiameter / 2 })
    );

    const capillaryBore = translate(
        [0, 0, guideLength / 2 - capillaryLength / 2],
        cylinder({ height: capillaryLength + 1, radius: capillaryBoreDiameter / 2 })
    );

    let shell = subtract(body, needleBore, capillaryBore);

    const ridgeCount = 16;
    const ridgeDepth = 0.5;
    const ridgeWidth = 0.9;
    const ridgeLength = guideLength;
    const radius = gripDiameter / 2 + ridgeDepth / 2;
    const ridge = cuboid({ size: [ridgeWidth, ridgeDepth, ridgeLength] });

    const ridges = [];
    for (let i = 0; i < ridgeCount; i += 1) {
        const angle = (i / ridgeCount) * Math.PI * 2;
        ridges.push(rotateZ(angle, translate([0, radius, 0], ridge)));
    }

    shell = union(shell, ...ridges);
    return shell;
};
