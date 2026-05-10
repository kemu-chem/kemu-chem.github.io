import * as modeling from "@jscad/modeling";

const { booleans, primitives, transforms } = modeling;

const { subtract } = booleans;
const { cuboid } = primitives;
const { translate, rotateX } = transforms;

const PLATE_SIZES = {
    "25x75": { width: 25, height: 75 },
    "60x50": { width: 60, height: 50 },
    "100x100": { width: 100, height: 100 },
    "200x200": { width: 200, height: 200 }
};

export const getParameterDefinitions = () => [
    {
        name: "plate_size",
        caption: "Plate size (W x H)",
        type: "choice",
        values: ["25x75", "60x50", "100x100", "200x200"],
        captions: ["25 x 75", "60 x 50", "100 x 100", "200 x 200"],
        initial: "60x50"
    },
    {
        name: "slot_count",
        caption: "Slot count",
        type: "int",
        initial: 5,
        min: 1,
        max: 20,
        step: 1
    },
    {
        name: "slot_spacing",
        caption: "Slot spacing (mm)",
        type: "float",
        initial: 8.0,
        min: 4.0,
        max: 20.0,
        step: 0.1
    },
    {
        name: "slot_depth",
        caption: "Slot depth (mm)",
        type: "float",
        initial: 5.0,
        min: 3.0,
        max: 10.0,
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
    const plate = PLATE_SIZES[params.plate_size] || PLATE_SIZES["60x50"];
    const slotCount = params.slot_count;
    const slotSpacing = params.slot_spacing;
    const slotDepth = params.slot_depth;
    const tolerance = params.tolerance;

    const plateThickness = 1.0;
    const wall = 3.0;
    const tiltRad = (8 * Math.PI) / 180;

    const slotWidth = plateThickness + tolerance;
    const baseLength = (slotCount - 1) * slotSpacing + slotWidth + wall * 2;
    const baseWidth = plate.width + wall * 2;
    const baseHeight = slotDepth + wall;

    let base = cuboid({ size: [baseLength, baseWidth, baseHeight] });

    const slotLength = plate.width + 2;
    const slotHeight = slotDepth + 2;
    const slotCenterZ = baseHeight / 2 - slotDepth / 2;
    const startX = -((slotCount - 1) * slotSpacing) / 2;

    const slots = [];
    for (let i = 0; i < slotCount; i += 1) {
        const x = startX + i * slotSpacing;
        const slot = rotateX(tiltRad, cuboid({ size: [slotWidth, slotLength, slotHeight] }));
        slots.push(translate([x, 0, slotCenterZ], slot));
    }

    base = subtract(base, ...slots);
    return base;
};
