import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon } from "./shared";

export const dinoGameMeta = defineFrameMeta({
  name: "dino-game",
  label: "Dino Game",
  category: "games",
  iconUrl: widgetIcon("dino-game"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "Chrome-dino style runner game on canvas — jump cacti with SPACE or tap. High score persists locally. For when the market is boring. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});

export const snakeMeta = defineFrameMeta({
  name: "snake",
  label: "Snake",
  category: "games",
  iconUrl: widgetIcon("snake"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Classic snake game on canvas — steer with the arrow keys (or swipe), eat dots to grow, avoid the walls and your own tail. High score persists locally. For when the market is flat. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});

export const flappyBirdMeta = defineFrameMeta({
  name: "flappy-bird",
  label: "Flappy Bird",
  category: "games",
  iconUrl: widgetIcon("flappy-bird"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Flappy-bird style game on canvas — tap or press SPACE to flap through the gaps between pipes. High score persists locally. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});
