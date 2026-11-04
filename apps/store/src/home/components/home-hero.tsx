"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export type HeroLink = {
  href: string;
  label: string;
  newTab?: boolean;
};

export type HeroImage = {
  src: string;
  alt?: string;
};

export type HomeHeroProps = {
  title?: string;
  subtitle?: string;
  cta?: HeroLink | null;
  image?: HeroImage | null;
};

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a), 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

type Pin =
  | { type: "oven"; bg: string; cab: string; cab2: string; glow: number; ar: number; title: string }
  | { type: "hob"; bg: string; layout: number; ar: number; title: string }
  | {
      type: "palette";
      bg: string;
      main: string;
      label: string;
      c1: string;
      l1: string;
      c2: string;
      l2: string;
      c3: string;
      l3: string;
      bar: string;
      ar: number;
      title: string;
    }
  | { type: "pendant"; bg: string; dome: string; prop: "bowl" | "pot" | "none"; ar: number; title: string }
  | { type: "tap"; bg: string; tc: string; water: boolean; ar: number; title: string }
  | { type: "shelf"; bg: string; tc: string; ar: number; title: string }
  | { type: "knob"; bg: string; metal: "brass" | "steel"; ar: number; title: string }
  | { type: "hood"; bg: string; cab: string; ar: number; title: string }
  | { type: "sinkTop"; bg: string; double: boolean; ar: number; title: string }
  | { type: "wine"; bg: string; ar: number; title: string };

const COLUMNS_DATA: Pin[][] = [
  [
    { type: "oven", bg: "#cfe0d3", cab: "#2f4b40", cab2: "#4a685c", glow: 0.9, ar: 0.75, title: "Built-in oven in forest green" },
    { type: "hob", bg: "#f3d6d1", layout: 0, ar: 1.0, title: "Flush gas hob in blush marble" },
    {
      type: "palette",
      bg: "#f6e8b8",
      main: "#f3efe8",
      label: "Carrara marble",
      c1: "#8fb09a",
      l1: "Sage",
      c2: "#c49b52",
      l2: "Brass",
      c3: "#2f4b40",
      l3: "Forest",
      bar: "#c8a372",
      ar: 0.6,
      title: "Sage, brass and marble palette",
    },
    { type: "pendant", bg: "#d3e3f0", dome: "#c49b52", prop: "bowl", ar: 0.67, title: "Brass pendant over the island" },
  ],
  [
    { type: "tap", bg: "#e0d9f0", tc: "#cfc4e8", water: true, ar: 0.8, title: "Brass gooseneck tap on lilac tile" },
    { type: "shelf", bg: "#cfe0d3", tc: "#a9c4b0", ar: 0.75, title: "Zellige splashback in sage" },
    { type: "knob", bg: "#2f353a", metal: "brass", ar: 1.0, title: "Brass knob details" },
    { type: "hood", bg: "#e8dccb", cab: "#6f8f7c", ar: 0.67, title: "Hood hidden in the cabinet" },
  ],
  [
    { type: "sinkTop", bg: "#d3e3f0", double: false, ar: 1.0, title: "Undermount sink, top view" },
    { type: "wine", bg: "#35544a", ar: 0.75, title: "Built-in wine cooler" },
    { type: "oven", bg: "#e0d9f0", cab: "#5b4a78", cab2: "#736290", glow: 0.0, ar: 0.75, title: "Plum cabinetry, steel oven" },
    { type: "tap", bg: "#f6e8b8", tc: "#efdc9a", water: false, ar: 0.8, title: "Gooseneck tap, butter tile" },
  ],
  [
    {
      type: "palette",
      bg: "#e8dccb",
      main: "#c8a372",
      label: "Natural oak",
      c1: "#6f8f7c",
      l1: "Moss",
      c2: "#cbd2d6",
      l2: "Steel",
      c3: "#1f2427",
      l3: "Black",
      bar: "#f0ece5",
      ar: 0.6,
      title: "Oak, steel and moss palette",
    },
    { type: "hob", bg: "#f6e8b8", layout: 1, ar: 1.0, title: "Gas hob set into butter stone" },
    { type: "pendant", bg: "#cfe0d3", dome: "#35544a", prop: "pot", ar: 0.67, title: "Green pendant, soft light" },
    { type: "shelf", bg: "#f3d6d1", tc: "#efc6c0", ar: 0.75, title: "Blush tile, brass jar" },
  ],
  [
    { type: "knob", bg: "#2f353a", metal: "steel", ar: 1.0, title: "Steel knob, close up" },
    { type: "oven", bg: "#d3e3f0", cab: "#35516d", cab2: "#4e6984", glow: 0.75, ar: 0.75, title: "Navy cabinetry, built-in oven" },
    { type: "sinkTop", bg: "#e8dccb", double: true, ar: 1.0, title: "Double bowl sink" },
    { type: "pendant", bg: "#d3e3f0", dome: "#cfd5d9", prop: "none", ar: 0.67, title: "Steel pendant over the hob" },
  ],
];

const KW = 1200; // Logical kitchen scene width
const KH = 900; // Logical kitchen scene height (4:3)

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  c.beginPath();
  c.moveTo(x + rad, y);
  c.arcTo(x + w, y, x + w, y + h, rad);
  c.arcTo(x + w, y + h, x, y + h, rad);
  c.arcTo(x, y + h, x, y, rad);
  c.arcTo(x, y, x + w, y, rad);
  c.closePath();
}

function fillRRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string
) {
  c.fillStyle = color;
  rrect(c, x, y, w, h, r);
  c.fill();
}

function fillCircle(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();
}

function drawBurner(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  flameAlpha: number
) {
  c.fillStyle = "#181c20";
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fill();

  if (flameAlpha > 0.01) {
    c.save();
    c.strokeStyle = `rgba(115, 178, 255, ${flameAlpha})`;
    c.lineWidth = Math.max(1.5, rx * 0.14);
    c.beginPath();
    c.ellipse(cx, cy, rx * 0.84, ry * 0.84, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  c.fillStyle = "#b88f47";
  c.beginPath();
  c.ellipse(cx, cy, rx * 0.42, ry * 0.42, 0, 0, Math.PI * 2);
  c.fill();
}

function drawPinArtwork(
  c: CanvasRenderingContext2D,
  pin: Pin,
  x: number,
  y: number,
  w: number,
  h: number
) {
  c.save();
  rrect(c, x, y, w, h, 16);
  c.fillStyle = pin.bg;
  c.fill();
  c.clip();

  const ux = (v: number) => x + (v / 100) * w;
  const uy = (v: number) => y + (v / 100) * w;
  const uw = (v: number) => (v / 100) * w;

  if (pin.type === "oven") {
    fillRRect(c, ux(9), uy(7), uw(82), uw(119), uw(2.5), pin.cab);
    fillRRect(c, ux(15), uy(11), uw(70), uw(14), uw(1.5), pin.cab2);
    fillRRect(c, ux(34), uy(22), uw(32), uw(1.3), uw(0.6), "#c49b52");
    fillRRect(c, ux(15), uy(29), uw(70), uw(72), uw(1.5), "#0e1114");
    fillRRect(c, ux(17), uy(31), uw(66), uw(12), uw(1), "#cfd5d9");
    [24.3, 34.8, 65.8, 75.8].forEach((kx) => fillCircle(c, ux(kx), uy(37), uw(3.6), "#adb5bd"));
    fillRRect(c, ux(41), uy(33.6), uw(18), uw(6.8), uw(1), "#05080b");
    fillRRect(c, ux(44), uy(36.2), uw(12), uw(1.6), 1, "#7fb0ff");
    fillRRect(c, ux(17), uy(45), uw(66), uw(54), uw(1.5), "#1c2126");
    fillRRect(c, ux(21), uy(52), uw(58), uw(36), uw(1), "#0d1013");
    if (pin.glow > 0) {
      const g = c.createRadialGradient(ux(50), uy(70), uw(2), ux(50), uy(70), uw(28));
      g.addColorStop(0, `rgba(255,176,90,${pin.glow})`);
      g.addColorStop(1, "rgba(255,120,45,0)");
      c.fillStyle = g;
      c.fillRect(ux(21), uy(52), uw(58), uw(36));
    }
    fillRRect(c, ux(22), uy(64), uw(56), uw(0.9), 0, "rgba(214,220,226,0.7)");
    fillRRect(c, ux(22), uy(76), uw(56), uw(0.9), 0, "rgba(214,220,226,0.7)");
    fillRRect(c, ux(21), uy(47.2), uw(58), uw(2.4), uw(1.2), "#d8dde1");
    fillRRect(c, ux(15), uy(104), uw(70), uw(17), uw(1.5), pin.cab2);
    fillRRect(c, ux(36), uy(108), uw(28), uw(1.3), uw(0.6), "#c49b52");
  } else if (pin.type === "hob") {
    fillRRect(c, ux(11), uy(11), uw(78), uw(72), uw(3), "#181d22");
    const coords =
      pin.layout === 0
        ? [
            [32.5, 30.5, 13.5],
            [67, 26, 10],
            [29.5, 62.5, 10.5],
            [66, 62, 14],
          ]
        : [
            [27, 27, 11],
            [59, 30, 15],
            [34, 62, 14],
            [69, 64, 10],
          ];
    coords.forEach(([bx, by, br]) => drawBurner(c, ux(bx), uy(by), uw(br), uw(br), 0.9));
    [24, 41, 58, 75].forEach((kx) => fillCircle(c, ux(kx), uy(92), uw(3), "#b8c0c7"));
  } else if (pin.type === "palette") {
    fillCircle(c, ux(50), uy(50), uw(36), pin.main);
    [
      [21, pin.c1],
      [50, pin.c2],
      [79, pin.c3],
    ].forEach(([cx, col]) => {
      fillCircle(c, ux(Number(cx)), uy(105), uw(12), String(col));
    });
    fillRRect(c, ux(9), uy(130), uw(82), uw(12), uw(2.4), pin.bar);
  } else if (pin.type === "pendant") {
    fillRRect(c, ux(49.4), uy(0), uw(1.2), uw(35), 0, "#1b1f22");
    fillRRect(c, ux(46), uy(33), uw(8), uw(4), uw(1), "#c49b52");
    c.fillStyle = pin.dome;
    c.beginPath();
    c.arc(ux(50), uy(64), uw(28), Math.PI, 0);
    c.closePath();
    c.fill();
    fillCircle(c, ux(50), uy(65), uw(11), "#fff6dc");
    const beam = c.createLinearGradient(0, uy(66), 0, uy(128));
    beam.addColorStop(0, "rgba(255,238,200,0.55)");
    beam.addColorStop(1, "rgba(255,238,200,0)");
    c.fillStyle = beam;
    c.beginPath();
    c.moveTo(ux(22), uy(66));
    c.lineTo(ux(78), uy(66));
    c.lineTo(ux(94), uy(128));
    c.lineTo(ux(6), uy(128));
    c.closePath();
    c.fill();
    fillRRect(c, ux(0), uy(128), uw(100), uw(24), 0, "#ece7e0");
    if (pin.prop === "bowl") {
      fillRRect(c, ux(34), uy(117), uw(32), uw(11), uw(5), "#e4dccf");
      fillCircle(c, ux(44), uy(114), uw(4.5), "#e1a24a");
      fillCircle(c, ux(54), uy(115), uw(4.5), "#9bb86a");
    } else if (pin.prop === "pot") {
      fillRRect(c, ux(34), uy(116), uw(32), uw(12), uw(2), "#c4cbd0");
    }
  } else if (pin.type === "tap") {
    fillRRect(c, ux(0), uy(0), uw(100), uw(80), 0, pin.tc);
    c.strokeStyle = "rgba(255,255,255,0.4)";
    c.lineWidth = 1;
    const step = uw(10);
    for (let gx = step; gx < w; gx += step) {
      c.beginPath();
      c.moveTo(x + gx, y);
      c.lineTo(x + gx, uy(80));
      c.stroke();
    }
    for (let gy = step; gy < uw(80); gy += step) {
      c.beginPath();
      c.moveTo(x, y + gy);
      c.lineTo(x + w, y + gy);
      c.stroke();
    }
    fillRRect(c, ux(0), uy(80), uw(100), uw(45), 0, "#f0ece5");
    fillRRect(c, ux(14), uy(81), uw(72), uw(12), uw(2), "#9aa4ab");
    const tx = pin.water ? 46 : 30;
    fillRRect(c, ux(tx), uy(40), uw(5), uw(41), 0, "#b88f47");
    c.strokeStyle = "#b88f47";
    c.lineWidth = uw(5);
    c.beginPath();
    c.arc(ux(tx + 17), uy(40), uw(14.5), Math.PI, 0);
    c.stroke();
    if (pin.water) {
      fillRRect(c, ux(77.5), uy(45), uw(1.8), uw(34), 0, "rgba(150,210,255,0.85)");
    }
  } else if (pin.type === "shelf") {
    fillRRect(c, ux(0), uy(0), uw(100), uw(134), 0, pin.tc);
    c.strokeStyle = "rgba(255,255,255,0.38)";
    c.lineWidth = 1;
    const step = uw(12.5);
    for (let gx = step; gx < w; gx += step) {
      c.beginPath();
      c.moveTo(x + gx, y);
      c.lineTo(x + gx, y + h);
      c.stroke();
    }
    for (let gy = step; gy < h; gy += step) {
      c.beginPath();
      c.moveTo(x, y + gy);
      c.lineTo(x + w, y + gy);
      c.stroke();
    }
    fillRRect(c, ux(0), uy(98), uw(100), uw(5), 0, "#c8a372");
    fillRRect(c, ux(56), uy(80), uw(14), uw(18), uw(2), "#e8e0d3");
    fillRRect(c, ux(57.5), uy(77), uw(11), uw(3.2), uw(1.5), "#b88f47");
    fillRRect(c, ux(16), uy(86), uw(16), uw(12), uw(4), "#e8e0d3");
    fillCircle(c, ux(22), uy(76), uw(6), "#4f7d63");
    fillCircle(c, ux(27), uy(73), uw(6), "#68967a");
  } else if (pin.type === "knob") {
    const col = pin.metal === "brass" ? "#c49b52" : "#bcc4ca";
    const col2 = pin.metal === "brass" ? "#9e7832" : "#8d969e";
    c.strokeStyle = "#7b838a";
    c.lineWidth = 2;
    c.setLineDash([3, 6]);
    c.beginPath();
    c.arc(ux(50), uy(50), uw(40), 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    fillCircle(c, ux(50), uy(50), uw(31), col);
    fillCircle(c, ux(50), uy(50), uw(21), col2);
    fillRRect(c, ux(48.6), uy(21), uw(2.8), uw(20), uw(1.4), "#1e2226");
  } else if (pin.type === "hood") {
    fillRRect(c, ux(8), uy(4), uw(84), uw(78), uw(2), pin.cab);
    fillRRect(c, ux(36), uy(70), uw(28), uw(1.4), uw(0.7), "#c49b52");
    fillRRect(c, ux(8), uy(82), uw(84), uw(9), uw(1.5), "#cfd5d9");
    fillRRect(c, ux(14), uy(89), uw(72), uw(1.5), 0, "#fff4d6");
    fillRRect(c, ux(28), uy(120), uw(40), uw(10), uw(2), "#262c31");
    fillRRect(c, ux(0), uy(130), uw(100), uw(22), 0, "#ece7e0");
  } else if (pin.type === "sinkTop") {
    fillRRect(c, ux(9), uy(20), uw(82), uw(64), uw(4), "#cfd6dc");
    if (pin.double) {
      fillRRect(c, ux(13), uy(25), uw(35), uw(54), uw(3), "#8a959e");
      fillRRect(c, ux(52), uy(25), uw(35), uw(54), uw(3), "#8a959e");
      fillCircle(c, ux(30.5), uy(56), uw(3), "#1b2024");
      fillCircle(c, ux(69.5), uy(56), uw(3), "#1b2024");
    } else {
      fillRRect(c, ux(14), uy(25), uw(72), uw(54), uw(3.5), "#8a959e");
      fillCircle(c, ux(50), uy(56), uw(3.5), "#1b2024");
    }
    fillCircle(c, ux(50), uy(12), uw(4), "#b88f47");
    fillRRect(c, ux(48.2), uy(12), uw(3.6), uw(23), uw(1.8), "#c49b52");
  } else if (pin.type === "wine") {
    fillRRect(c, ux(14), uy(8), uw(72), uw(116), uw(2.5), "#cfd5d9");
    fillRRect(c, ux(18), uy(12), uw(64), uw(100), uw(1.6), "#14181c");
    [36, 60, 84].forEach((sy) => fillRRect(c, ux(20), uy(sy), uw(60), uw(1.8), 0, "#c8a372"));
    [22, 46, 70, 94].forEach((by) => {
      for (let bx = 23; bx <= 72; bx += 7.5) {
        fillRRect(c, ux(bx), uy(by), uw(4.5), uw(12), uw(1), "#6a2433");
      }
    });
    fillRRect(c, ux(76), uy(44), uw(1.8), uw(36), uw(0.9), "#e2e6e9");
  }

  c.restore();
}

function buildKitchenSprite(dpr: number): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = Math.round(KW * dpr);
  off.height = Math.round(KH * dpr);
  const c = off.getContext("2d", { alpha: false });
  if (!c) return off;
  c.scale(dpr, dpr);

  const ux = (v: number) => (v / 100) * KW;
  const uy = (v: number) => ((v * 1.333333) / 100) * KH;
  const uw = (v: number) => (v / 100) * KW;
  const uh = (v: number) => ((v * 1.333333) / 100) * KH;

  // Wall & Floor
  const wallG = c.createLinearGradient(0, 0, 0, uy(64));
  wallG.addColorStop(0, "#d7e1d6");
  wallG.addColorStop(1, "#c2cfc2");
  c.fillStyle = wallG;
  c.fillRect(0, 0, KW, uy(64));

  const floorG = c.createLinearGradient(0, uy(64), 0, KH);
  floorG.addColorStop(0, "#bda486");
  floorG.addColorStop(1, "#a58a6c");
  c.fillStyle = floorG;
  c.fillRect(0, uy(64), KW, KH - uy(64));

  // Integrated Fridge Column (Left)
  fillRRect(c, ux(2), uy(3), uw(26), uh(5.6), 4, "#2f4b40");
  fillRRect(c, ux(2), uy(9), uw(26), uh(35), 4, "#2f4b40");
  fillRRect(c, ux(2), uy(44.4), uw(26), uh(19.6), 4, "#2f4b40");
  fillRRect(c, ux(26), uy(19), uw(0.55), uh(14), 3, "#c49b52");
  fillRRect(c, ux(26), uy(47), uw(0.55), uh(9), 3, "#c49b52");

  // Built-in Oven Tower
  fillRRect(c, ux(28.6), uy(3), uw(17.8), uh(61), 4, "#2f4b40");
  fillRRect(c, ux(29.4), uy(9), uw(16.2), uh(10), 3, "#4a685c");
  fillRRect(c, ux(33.5), uy(17.4), uw(8), uh(0.5), 2, "#c49b52");

  // Compact top oven
  fillRRect(c, ux(29.4), uy(19.8), uw(16.2), uh(8.2), 4, "#0e1114");
  fillRRect(c, ux(29.8), uy(20.2), uw(15.4), uh(7.4), 3, "#cfd5d9");
  fillRRect(c, ux(30.6), uy(21), uw(9), uh(5.8), 3, "#1a2026");
  fillRRect(c, ux(40.4), uy(21), uw(4.4), uh(5.8), 3, "#15181b");
  fillRRect(c, ux(40.9), uy(21.7), uw(3.4), uh(1), 2, "#05080b");
  fillRRect(c, ux(41.5), uy(22.05), uw(2.2), uh(0.3), 1, "#7fb0ff");
  fillCircle(c, ux(41.85), uy(24.65), uw(0.65), "#b8c0c7");
  fillCircle(c, ux(43.65), uy(24.65), uw(0.65), "#b8c0c7");

  // Main Pyrolytic Oven
  fillRRect(c, ux(29.4), uy(28.8), uw(16.2), uh(18.4), 4, "#0e1114");
  fillRRect(c, ux(29.8), uy(29.2), uw(15.4), uh(3.1), 3, "#cfd5d9");
  [31.55, 33.85, 41.75, 44.05].forEach((kx) => fillCircle(c, ux(kx), uy(30.75), uw(0.95), "#b8c0c7"));
  fillRRect(c, ux(35.2), uy(29.95), uw(4.9), uh(1.6), 2, "#05080b");
  fillRRect(c, ux(36.1), uy(30.55), uw(3.1), uh(0.4), 1, "#7fb0ff");
  fillRRect(c, ux(29.8), uy(32.7), uw(15.4), uh(14.1), 3, "#1b2026");
  fillRRect(c, ux(30.9), uy(34.3), uw(13.2), uh(9.2), 3, "#0d1013");
  fillRRect(c, ux(31.2), uy(37.7), uw(12.6), uh(0.22), 0, "rgba(214,220,226,0.65)");
  fillRRect(c, ux(31.2), uy(40.5), uw(12.6), uh(0.22), 0, "rgba(214,220,226,0.65)");
  fillRRect(c, ux(30.6), uy(33), uw(14), uh(0.75), 3, "#e1e5e8");
  fillRRect(c, ux(29.4), uy(47.8), uw(16.2), uh(5.4), 3, "#cfd5d9");
  fillRRect(c, ux(34.5), uy(49.7), uw(6.2), uh(0.35), 2, "#15181b");
  fillRRect(c, ux(29.4), uy(53.6), uw(16.2), uh(10.4), 3, "#4a685c");
  fillRRect(c, ux(34.6), uy(55.5), uw(5.8), uh(0.45), 2, "#c49b52");

  // Backsplash Tiles & Marble Slab behind Hob
  fillRRect(c, ux(46.4), uy(27.8), uw(53.6), uh(13.4), 0, "#b3c7b7");
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.lineWidth = 1;
  for (let gx = ux(46.4); gx < KW; gx += 22) {
    c.beginPath();
    c.moveTo(gx, uy(27.8));
    c.lineTo(gx, uy(41.2));
    c.stroke();
  }
  for (let gy = uy(27.8); gy < uy(41.2); gy += 22) {
    c.beginPath();
    c.moveTo(ux(46.4), gy);
    c.lineTo(KW, gy);
    c.stroke();
  }
  fillRRect(c, ux(49.6), uy(27.8), uw(22.4), uh(13.4), 0, "#f2efe9");

  // Base Units & Toe Kick
  fillRRect(c, ux(46.4), uy(62), uw(53.6), uh(2), 0, "#141a18");
  const baseDrawers = [
    [46.8, 47.4, 13.2, 6.2],
    [46.8, 53.8, 13.2, 8.2],
    [60.4, 47.4, 13.2, 6.2],
    [60.4, 53.8, 13.2, 8.2],
    [74.0, 47.4, 6.3, 14.6],
    [80.5, 47.4, 6.3, 14.6],
    [87.2, 47.4, 6.3, 14.6],
    [93.7, 47.4, 6.3, 14.6],
  ];
  baseDrawers.forEach(([bx, by, bw, bh]) => {
    fillRRect(c, ux(bx), uy(by), uw(bw), uh(bh), 3, "#2f4b40");
    fillRRect(c, ux(bx + bw * 0.32), uy(by + bh * 0.18), uw(bw * 0.36), 4, 2, "#c49b52");
  });

  // Worktop Slab & Surface
  fillRRect(c, ux(46.4), uy(45.7), uw(53.6), uh(1.6), 0, "#e8e3dc");
  fillRRect(c, ux(46.4), uy(41.2), uw(53.6), uh(4.5), 0, "#f7f4ef");

  // Upper Wall Cabinets & Integrated Hood Visor
  fillRRect(c, ux(46.8), uy(9), uw(2.8), uh(18.8), 3, "#2f4b40");
  fillRRect(c, ux(50), uy(9), uw(22), uh(15.8), 3, "#2f4b40");
  fillRRect(c, ux(72.4), uy(9), uw(13.2), uh(18.8), 3, "#2f4b40");
  fillRRect(c, ux(76.6), uy(25.8), uw(4.8), 4, 2, "#c49b52");
  fillRRect(c, ux(86), uy(9), uw(14), uh(18.8), 3, "#2f4b40");
  fillRRect(c, ux(90.5), uy(25.8), uw(5), 4, 2, "#c49b52");
  fillRRect(c, ux(50), uy(24.8), uw(22), uh(3), 4, "#cfd5d9");
  fillRRect(c, ux(57.5), uy(25.9), uw(7), uh(0.5), 2, "#15181b");

  // Flush Gas Hob Plate & Static Burner Bases
  fillRRect(c, ux(51.2), uy(41.6), uw(19.6), uh(3.4), 4, "#14181c");
  drawBurner(c, ux(55.9), uy(42.7), uw(1.85), uh(0.62), 0);
  drawBurner(c, ux(66.1), uy(42.7), uw(1.85), uh(0.62), 0);
  drawBurner(c, ux(56.3), uy(44.0), uw(2.45), uh(0.85), 0);
  drawBurner(c, ux(65.7), uy(44.0), uw(2.45), uh(0.85), 0);

  // Stainless Stockpot on Front-Left Burner
  fillRRect(c, ux(53.7), uy(39.3), uw(5.2), uh(4.3), 5, "#cfd6dc");
  fillRRect(c, ux(53.1), uy(40.2), uw(0.8), uh(1.1), 2, "#b3bbc2");
  fillRRect(c, ux(58.7), uy(40.2), uw(0.8), uh(1.1), 2, "#b3bbc2");

  // Undermount Sink & Brass Gooseneck Tap
  fillRRect(c, ux(77), uy(41.6), uw(16), uh(3.4), 4, "#9aa4ab");
  fillRRect(c, ux(78.2), uy(42), uw(13.6), uh(2.6), 3, "#727e86");
  fillRRect(c, ux(83.2), uy(35.8), uw(0.95), uh(6), 0, "#b88f47");
  fillRRect(c, ux(82.6), uy(41.1), uw(2.2), uh(0.7), 2, "#c49b52");
  c.strokeStyle = "#c49b52";
  c.lineWidth = uw(0.95);
  c.beginPath();
  c.arc(ux(86.1), uy(35.8), uw(2.9), Math.PI, 0);
  c.stroke();
  fillRRect(c, ux(87.75), uy(35.9), uw(1.5), uh(1.2), 2, "#cfd5d9");

  // Countertop Styling Props
  fillRRect(c, ux(47.3), uy(33.4), uw(3.3), uh(7.8), 5, "#c8a372");
  fillRRect(c, ux(73.4), uy(37.6), uw(1.9), uh(3.6), 4, "#e8e0d3");
  fillRRect(c, ux(75.4), uy(38.4), uw(1.5), uh(2.9), 4, "#dfd6c7");
  fillCircle(c, ux(95.8), uy(37.5), uw(1.6), "#517e64");
  fillCircle(c, ux(96.8), uy(38.0), uw(1.5), "#69977b");
  fillRRect(c, ux(94.4), uy(40.5), uw(3.4), uh(3.2), 6, "#e8e0d3");

  return off;
}

function drawKitchenOverlays(
  c: CanvasRenderingContext2D,
  p: number,
  ox: number,
  oy: number,
  scale: number,
  now: number
) {
  const ux = (v: number) => ox + (v / 100) * KW * scale;
  const uy = (v: number) => oy + ((v * 1.333333) / 100) * KH * scale;
  const uw = (v: number) => (v / 100) * KW * scale;
  const uh = (v: number) => ((v * 1.333333) / 100) * KH * scale;

  // 1. Concealed Hood LED & Light Cone (0.54 -> 0.66)
  const tHood = invLerp(0.54, 0.66, p);
  if (tHood > 0.01) {
    const coneG = c.createLinearGradient(0, uy(27.8), 0, uy(41.8));
    coneG.addColorStop(0, `rgba(255,240,205,${0.55 * tHood})`);
    coneG.addColorStop(1, "rgba(255,240,205,0)");
    c.fillStyle = coneG;
    c.beginPath();
    c.moveTo(ux(51.5), uy(27.8));
    c.lineTo(ux(70.5), uy(27.8));
    c.lineTo(ux(72.6), uy(41.8));
    c.lineTo(ux(49.4), uy(41.8));
    c.closePath();
    c.fill();

    fillRRect(c, ux(52), uy(27.2), uw(18), uh(0.45), 2, `rgba(255,244,214,${tHood})`);
  }

  // 2. Gas Hob Flames, Turning Knobs & Rising Steam (0.60 -> 0.74)
  const tHob = easeOutCubic(invLerp(0.6, 0.74, p));
  const knobAngle = (-90 + 125 * tHob) * (Math.PI / 180);
  [54.05, 58.65, 63.25, 67.85].forEach((kx) => {
    const cx = ux(kx);
    const cy = uy(46.5);
    const r = uw(0.55);
    fillCircle(c, cx, cy, r, "#d2d8dd");
    c.strokeStyle = "#1b2025";
    c.lineWidth = Math.max(1.5, r * 0.32);
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(knobAngle) * r * 0.85, cy + Math.sin(knobAngle) * r * 0.85);
    c.stroke();
  });

  if (tHob > 0.01) {
    drawBurner(c, ux(55.9), uy(42.7), uw(1.85), uh(0.62), tHob);
    drawBurner(c, ux(66.1), uy(42.7), uw(1.85), uh(0.62), tHob);
    drawBurner(c, ux(56.3), uy(44.0), uw(2.45), uh(0.85), tHob);
    drawBurner(c, ux(65.7), uy(44.0), uw(2.45), uh(0.85), tHob);

    // Re-draw pot body over rear-left burner
    fillRRect(c, ux(53.7), uy(39.3), uw(5.2), uh(4.3), 5 * scale, "#cfd6dc");

    const drift = (now * 0.002) % 1;
    [
      [55.8, 37.2, 1.2],
      [57.4, 35.2, 1.4],
      [56.1, 33.2, 1.1],
    ].forEach(([sx, sy, sr], idx) => {
      const yOff = ((drift + idx * 0.33) % 1) * 10 * scale;
      fillCircle(c, ux(sx), uy(sy) - yOff, uw(sr), `rgba(255,255,255,${0.42 * tHob})`);
    });
  }

  // 3. Built-in Oven Interior Warm Glow (0.66 -> 0.80)
  const tOven = invLerp(0.66, 0.8, p);
  if (tOven > 0.01) {
    const gx = ux(37.5);
    const gy = uy(38.9);
    const gr = uw(6.8);
    const og = c.createRadialGradient(gx, gy, gr * 0.1, gx, gy, gr);
    og.addColorStop(0, `rgba(255,176,90,${0.92 * tOven})`);
    og.addColorStop(0.65, `rgba(255,120,45,${0.45 * tOven})`);
    og.addColorStop(1, "rgba(255,90,20,0)");
    c.fillStyle = og;
    c.fillRect(ux(31.1), uy(34.5), uw(12.8), uh(8.8));
    fillRRect(c, ux(31.2), uy(37.7), uw(12.6), uh(0.2), 0, "rgba(214,220,226,0.75)");
    fillRRect(c, ux(31.2), uy(40.5), uw(12.6), uh(0.2), 0, "rgba(214,220,226,0.75)");
  }

  // 4. Brass Tap Water Stream & Sink Ripple (0.72 -> 0.90)
  const tWater = easeOutCubic(invLerp(0.72, 0.85, p));
  if (tWater > 0.01) {
    fillRRect(c, ux(88.35), uy(37.1), uw(0.42), uh(6.2 * tWater), 1, "rgba(175,222,255,0.9)");
  }
  const tRip = invLerp(0.79, 0.9, p);
  if (tRip > 0.01) {
    c.strokeStyle = `rgba(255,255,255,${0.85 * tRip})`;
    c.lineWidth = Math.max(1, 1.5 * scale);
    c.beginPath();
    c.ellipse(ux(88.6), uy(43.4), uw(1.4 * tRip), uh(0.38 * tRip), 0, 0, Math.PI * 2);
    c.stroke();
  }
}

export function HomeHero({}: HomeHeroProps) {
  const heroRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const brandRevealRef = useRef<HTMLDivElement>(null);
  const brandScrimRef = useRef<HTMLDivElement>(null);
  const brandTitleRef = useRef<HTMLHeadingElement>(null);
  const brandSubRef = useRef<HTMLDivElement>(null);

  const currentPRef = useRef(0);
  const isPlayingRef = useRef(true);
  const inViewRef = useRef(true);
  const scrollBoostRef = useRef(0);
  const delayRemainingRef = useRef(150);
  const lastTimeRef = useRef(0);
  const rafIdRef = useRef(0);

  const colSpritesRef = useRef<{ canvas: HTMLCanvasElement; w: number; h: number }[]>([]);
  const kitchenSpriteRef = useRef<HTMLCanvasElement | null>(null);

  const vwRef = useRef(1200);
  const vhRef = useRef(800);
  const isMobileRef = useRef(false);
  const dprRef = useRef(1.5);
  const isDarkRef = useRef(false);
  const colWidthRef = useRef(240);
  const colGapRef = useRef(16);
  const wallTotalWRef = useRef(1264);

  const brandCulledRef = useRef<boolean | null>(null);
  const lastBrandTRef = useRef(-1);

  const renderFrame = (p: number, now = performance.now(), force = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    if (force) {
      brandCulledRef.current = null;
      lastBrandTRef.current = -1;
    }

    // Brand reveal: cinematic lighting shift, mask glide, focus pull & staggered entrance
    const brandReveal = brandRevealRef.current;
    if (brandReveal) {
      const showBrand = p >= 0.72;
      if (showBrand !== brandCulledRef.current) {
        brandCulledRef.current = showBrand;
        brandReveal.style.display = showBrand ? "block" : "none";
      }
      if (showBrand) {
        // Scrim opacity (0.72 -> 0.90): gentle showroom mood lighting
        const tScrim = easeOutCubic(invLerp(0.72, 0.90, p));
        if (brandScrimRef.current) {
          brandScrimRef.current.style.opacity = (tScrim * 0.65).toFixed(3);
        }

        // Title entrance (0.75 -> 0.93): rises 60px from baseline mask, blur dissolves, scale settles
        const tTitle = easeOutCubic(invLerp(0.75, 0.93, p));
        if (brandTitleRef.current) {
          const yOff = (1 - tTitle) * 60;
          const blurVal = (1 - tTitle) * 8;
          const scaleVal = 1.05 - 0.05 * tTitle;
          brandTitleRef.current.style.transform = `translate3d(0,${yOff.toFixed(1)}px,0) scale(${scaleVal.toFixed(3)})`;
          brandTitleRef.current.style.opacity = tTitle.toFixed(3);
          brandTitleRef.current.style.filter = blurVal > 0.1 ? `blur(${blurVal.toFixed(1)}px)` : "none";
        }

        // Subtitle entrance (0.83 -> 0.98): staggered float up in frosted pill
        const tSub = easeOutCubic(invLerp(0.83, 0.98, p));
        if (brandSubRef.current) {
          const yOffSub = (1 - tSub) * 32;
          brandSubRef.current.style.transform = `translate3d(0,${yOffSub.toFixed(1)}px,0)`;
          brandSubRef.current.style.opacity = tSub.toFixed(3);
        }

        brandReveal.style.pointerEvents = tTitle > 0.7 ? "auto" : "none";
      }
    }

    const vw = vwRef.current;
    const vh = vhRef.current;
    const dpr = dprRef.current;
    const isMobile = isMobileRef.current;
    const isDark = isDarkRef.current;
    const wallTotalW = wallTotalWRef.current;
    const colWidth = colWidthRef.current;
    const colGap = colGapRef.current;
    const colSprites = colSpritesRef.current;
    const kitchenSprite = kitchenSpriteRef.current;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Draw Wall Pins
    if (p < 0.58) {
      ctx.fillStyle = isDark ? "#111111" : "#ffffff";
      ctx.fillRect(0, 0, vw, vh);

      const tWall = invLerp(0.0, 0.58, p);
      const tWallIn = easeOutCubic(invLerp(0.0, 0.48, p));
      const wallBaseY = lerp(vh * 0.42, -vh * 0.04, tWallIn);
      const colShift = (isMobile ? vh * 0.1 : vh * 0.2) * tWall;
      const tWallOut = easeInOutCubic(invLerp(0.38, 0.57, p));
      const startX = (vw - wallTotalW) * 0.5;

      ctx.globalAlpha = 1 - tWallOut;
      for (let i = 0; i < colSprites.length; i++) {
        const sp = colSprites[i];
        const dir = i % 2 === 0 ? -1 : 1;
        const staggerY = i % 2 === 1 ? -vh * (isMobile ? 0.16 : 0.24) : 0;
        const cx = startX + i * (colWidth + colGap);
        const cy = wallBaseY + staggerY + dir * colShift;
        ctx.drawImage(sp.canvas, cx, cy, sp.w, sp.h);
      }
      ctx.globalAlpha = 1;
    }

    // 2. Expanding Kitchen Scene
    if (p >= 0.14 && kitchenSprite) {
      const tFeatIn = easeOutCubic(invLerp(0.14, 0.3, p));
      const tOpen = easeInOutCubic(invLerp(0.3, 0.58, p));
      const s0 = isMobile ? 0.62 : 0.44;
      const cardScale = lerp(s0, 1.0, tOpen);
      const cardY = (1 - tFeatIn) * vh * 0.12;
      const cardW = vw * cardScale;
      const cardH = vh * cardScale;
      const cardX = (vw - cardW) * 0.5;
      const cardTop = (vh - cardH) * 0.5 + cardY;
      const radius = (1 - tOpen) * (isMobile ? 22 : 28);

      ctx.save();
      ctx.globalAlpha = tFeatIn;

      if (cardScale < 0.999) {
        rrect(ctx, cardX, cardTop, cardW, cardH, radius);
        ctx.clip();
      }

      const coverScale = Math.max(cardW / KW, cardH / KH);
      const drawW = KW * coverScale;
      const drawH = KH * coverScale;
      const panRatio = isMobile
        ? lerp(-0.44, -0.56, easeInOutCubic(invLerp(0.55, 0.9, p)))
        : -0.5;
      const ox = cardX + cardW * 0.5 + drawW * panRatio;
      const oy = cardTop + (cardH - drawH) * 0.5;

      ctx.drawImage(kitchenSprite, ox, oy, drawW, drawH);

      if (p > 0.52) {
        drawKitchenOverlays(ctx, p, ox, oy, coverScale, now);
      }

      ctx.restore();
    }

    ctx.restore();
  };

  const ensureLoop = () => {
    if (!rafIdRef.current && inViewRef.current && isPlayingRef.current) {
      lastTimeRef.current = performance.now();
      rafIdRef.current = requestAnimationFrame(tick);
    }
  };

  const tick = (now: number) => {
    rafIdRef.current = 0;
    if (!inViewRef.current || !isPlayingRef.current) return;

    const dtMs = Math.min(50, now - lastTimeRef.current);
    const dtSec = dtMs / 1000;
    lastTimeRef.current = now;

    if (delayRemainingRef.current > 0) {
      delayRemainingRef.current -= dtMs;
    } else {
      scrollBoostRef.current = Math.max(0, scrollBoostRef.current - dtSec * 1.8);
      const speedMultiplier = Math.min(1.6, 1 + scrollBoostRef.current);
      currentPRef.current = clamp(
        currentPRef.current + 0.25 * speedMultiplier * dtSec,
        0,
        1
      );
      renderFrame(currentPRef.current, now);

      if (currentPRef.current >= 1) {
        isPlayingRef.current = false;
        renderFrame(1, now);
        return;
      }
    }

    if (isPlayingRef.current && inViewRef.current) {
      rafIdRef.current = requestAnimationFrame(tick);
    }
  };

  const initSprites = () => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !stage) return;

    const vw = stage.clientWidth || window.innerWidth;
    const vh = stage.clientHeight || window.innerHeight;
    const isMobile = vw < 820;
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.75);
    const isDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

    vwRef.current = vw;
    vhRef.current = vh;
    isMobileRef.current = isMobile;
    dprRef.current = dpr;
    isDarkRef.current = isDark;

    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);

    const numCols = isMobile ? 3 : 5;
    const colGap = isMobile ? 12 : 16;
    const wallTotalW = isMobile ? vw * 1.42 : Math.min(1480, vw * 1.2);
    const colWidth = (wallTotalW - colGap * (numCols - 1)) / numCols;

    colGapRef.current = colGap;
    wallTotalWRef.current = wallTotalW;
    colWidthRef.current = colWidth;

    const colSprites: { canvas: HTMLCanvasElement; w: number; h: number }[] = [];
    for (let cIdx = 0; cIdx < numCols; cIdx++) {
      const pins = COLUMNS_DATA[cIdx];
      let totalH = 0;
      const heights = pins.map((p) => {
        const h = Math.round(colWidth / p.ar);
        totalH += h + colGap;
        return h;
      });

      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.round(colWidth * dpr));
      off.height = Math.max(1, Math.round(totalH * dpr));
      const c = off.getContext("2d");
      if (!c) continue;
      c.scale(dpr, dpr);

      let curY = 0;
      for (let i = 0; i < pins.length; i++) {
        const pin = pins[i];
        const ph = heights[i];
        drawPinArtwork(c, pin, 0, curY, colWidth, ph);
        curY += ph + colGap;
      }
      colSprites.push({ canvas: off, w: colWidth, h: totalH });
    }

    colSpritesRef.current = colSprites;
    kitchenSpriteRef.current = buildKitchenSprite(dpr);
  };

  useEffect(() => {
    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      currentPRef.current = 1;
      isPlayingRef.current = false;
    } else {
      currentPRef.current = 0;
      isPlayingRef.current = true;
    }

    initSprites();
    renderFrame(currentPRef.current, performance.now(), true);
    ensureLoop();

    const onScroll = () => {
      if (isPlayingRef.current && currentPRef.current < 1) {
        delayRemainingRef.current = 0;
        scrollBoostRef.current = Math.min(0.6, scrollBoostRef.current + 0.15);
        ensureLoop();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        initSprites();
        renderFrame(currentPRef.current, performance.now(), true);
      }, 120);
    };
    window.addEventListener("resize", onResize, { passive: true });

    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && heroRef.current) {
      io = new IntersectionObserver(
        (entries) => {
          inViewRef.current = entries[0].isIntersecting;
          if (inViewRef.current && isPlayingRef.current && currentPRef.current < 1) {
            ensureLoop();
          }
        },
        { threshold: 0.01 }
      );
      io.observe(heroRef.current);
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
      if (io) io.disconnect();
    };
  }, []);

  return (
    <section
      ref={heroRef}
      className="home-hero hero"
      id="hero"
      dir="ltr"
      aria-label="Built-in kitchen appliances showcase"
    >
      <div ref={stageRef} className="stage" id="stage">
        {/* Hardware-accelerated canvas */}
        <canvas ref={canvasRef} id="stageCanvas" aria-hidden="true" />

        {/* Brand reveal at end of animation */}
        <div
          ref={brandRevealRef}
          className="brand-reveal"
          id="brandReveal"
          dir="rtl"
        >
          {/* Ambient showroom lighting scrim */}
          <div ref={brandScrimRef} className="brand-reveal-scrim" />

          {/* Box 1 (center): خانه مدرن with mask & blur-to-sharp reveal */}
          <div className="brand-reveal-center">
            <Link href="/products" className="brand-reveal-title-link">
              <div className="brand-title-mask">
                <h2 ref={brandTitleRef} className="brand-reveal-title">
                  خانه مدرن
                </h2>
              </div>
            </Link>
          </div>

          {/* Box 2 (bottom): هود · سینک · شیرآلات · فر · اجاق with frosted badge */}
          <div className="brand-reveal-bottom">
            <Link href="/products" className="brand-reveal-sub-link">
              <div ref={brandSubRef} className="brand-sub-badge">
                <p className="brand-reveal-subtitle">هود · سینک · شیرآلات · فر · اجاق</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
