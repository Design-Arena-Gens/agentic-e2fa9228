"use client";

import { useEffect, useRef, useState } from "react";
import Matter, { Bodies, Body, Composite, Composites, Constraint, Engine, Events, Vector, World } from "matter-js";

type GameState = "playing" | "won" | "dead";

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<GameState>("playing");
  const engineRef = useRef<Engine | null>(null);
  const playerRef = useRef<{ torso: Body; head: Body; foot: Body; rod: Body } | null>(null);
  const worldRef = useRef<Matter.World | null>(null);
  const cameraXRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const canJumpRef = useRef<boolean>(false);
  const lastJumpAtRef = useRef<number>(0);
  const finishRef = useRef<Body | null>(null);
  const rafRef = useRef<number | null>(null);
  const [restartTick, setRestartTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
    engineRef.current = engine;
    const world = engine.world;
    worldRef.current = world;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const makeLevel = () => {
      // Ground and terrain
      const ground = Bodies.rectangle(2000, canvas.height / dpr - 20, 6000, 40, {
        isStatic: true,
        label: "ground",
        friction: 0.9,
        render: { fillStyle: "#2b2d42" },
      });

      const smallPlatforms: Body[] = [
        Bodies.rectangle(600, canvas.height / dpr - 120, 200, 16, { isStatic: true, angle: -0.15, label: "platform" }),
        Bodies.rectangle(950, canvas.height / dpr - 180, 220, 16, { isStatic: true, angle: 0.2, label: "platform" }),
        Bodies.rectangle(1300, canvas.height / dpr - 140, 160, 16, { isStatic: true, angle: -0.25, label: "platform" }),
        Bodies.rectangle(1650, canvas.height / dpr - 210, 180, 16, { isStatic: true, angle: 0.15, label: "platform" }),
      ];

      // Spikes
      const makeSpike = (x: number, y: number, size = 36) => {
        const half = size / 2;
        const verts = [
          { x: x - half, y: y + half },
          { x: x + half, y: y + half },
          { x: x, y: y - half },
        ];
        return Bodies.fromVertices(x, y, [verts], {
          isStatic: true,
          label: "hazard",
          friction: 0.6,
          restitution: 0.2,
        });
      };

      const spikes: Body[] = [];
      for (let i = 0; i < 12; i++) {
        spikes.push(makeSpike(1950 + i * 38, canvas.height / dpr - 58, 42));
      }

      // Stair steps
      const stairs: Body[] = [];
      for (let i = 0; i < 8; i++) {
        stairs.push(
          Bodies.rectangle(2300 + i * 120, canvas.height / dpr - 40 - i * 26, 110, 14, {
            isStatic: true,
            label: "platform",
          })
        );
      }

      // Finish line sensor
      const finish = Bodies.rectangle(3600, canvas.height / dpr - 160, 20, 280, {
        isStatic: true,
        isSensor: true,
        label: "finish",
      });
      finishRef.current = finish as Body;

      World.add(world, [ground, ...smallPlatforms, ...spikes, ...stairs, finish]);
    };

    const makePlayer = (x = 120, y = canvas.height / dpr - 140) => {
      const foot = Bodies.circle(x, y + 40, 20, {
        label: "foot",
        friction: 1.0,
        restitution: 0.9,
      });

      const rod = Bodies.rectangle(x, y, 12, 120, {
        label: "rod",
        chamfer: { radius: 6 },
        density: 0.002,
        friction: 0.8,
        restitution: 0.2,
      });

      const torso = Bodies.circle(x, y - 80, 26, {
        label: "torso",
        density: 0.002,
        friction: 0.6,
      });

      const head = Bodies.circle(x, y - 120, 16, {
        label: "head",
        density: 0.0015,
        friction: 0.4,
        restitution: 0.1,
      });

      const footToRod = Constraint.create({
        bodyA: foot,
        bodyB: rod,
        pointA: { x: 0, y: 0 },
        pointB: { x: 0, y: 58 },
        stiffness: 0.9,
        damping: 0.15,
      });

      const rodToTorso = Constraint.create({
        bodyA: rod,
        bodyB: torso,
        pointA: { x: 0, y: -58 },
        pointB: { x: 0, y: 12 },
        stiffness: 0.8,
        damping: 0.2,
      });

      const torsoToHead = Constraint.create({
        bodyA: torso,
        bodyB: head,
        pointA: { x: 0, y: -24 },
        pointB: { x: 0, y: 12 },
        stiffness: 0.7,
        damping: 0.25,
      });

      World.add(worldRef.current!, [foot, rod, torso, head, footToRod, rodToTorso, torsoToHead]);
      playerRef.current = { torso, head, foot, rod };
    };

    makeLevel();
    makePlayer();

    // Input
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        restart();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { keysRef.current[e.key] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Collisions
    Events.on(engine, "collisionStart", (evt) => {
      for (const pair of evt.pairs) {
        const a = pair.bodyA; const b = pair.bodyB;
        const mark = (lab: string) => {
          if (a.label === lab || b.label === lab) return true;
          return false;
        };
        // Jump eligibility: foot with ground/platform
        if (
          (a.label === "foot" && (b.label === "ground" || b.label === "platform")) ||
          (b.label === "foot" && (a.label === "ground" || a.label === "platform"))
        ) {
          canJumpRef.current = true;
        }
        // Finish
        if (
          (a.label === "finish" && (b.label === "torso" || b.label === "head")) ||
          (b.label === "finish" && (a.label === "torso" || a.label === "head"))
        ) {
          setState("won");
        }
        // Hazards: head impacts spikes
        if (
          (a.label === "head" && b.label === "hazard") ||
          (b.label === "head" && a.label === "hazard")
        ) {
          const head = playerRef.current?.head;
          if (head && Vector.magnitude(head.velocity) > 3) setState("dead");
        }
      }
    });

    Events.on(engine, "collisionEnd", (evt) => {
      for (const pair of evt.pairs) {
        const a = pair.bodyA; const b = pair.bodyB;
        if (
          (a.label === "foot" && (b.label === "ground" || b.label === "platform")) ||
          (b.label === "foot" && (a.label === "ground" || a.label === "platform"))
        ) {
          canJumpRef.current = false;
        }
      }
    });

    const ctx = canvas.getContext("2d")!;

    const renderBody = (body: Body, color: string) => {
      const vertices = body.vertices;
      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let j = 1; j < vertices.length; j++) ctx.lineTo(vertices[j].x, vertices[j].y);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.stroke();
    };

    const step = (t: number) => {
      // Game over freeze
      if (state !== "playing") {
        draw();
        return;
      }

      const player = playerRef.current!;
      const now = performance.now();

      // Controls
      if (keysRef.current["ArrowLeft"]) {
        Body.applyForce(player.torso, player.torso.position, { x: -0.0016, y: 0 });
        Body.setAngularVelocity(player.torso, player.torso.angularVelocity - 0.02);
      }
      if (keysRef.current["ArrowRight"]) {
        Body.applyForce(player.torso, player.torso.position, { x: 0.0016, y: 0 });
        Body.setAngularVelocity(player.torso, player.torso.angularVelocity + 0.02);
      }
      if (keysRef.current["ArrowUp"]) {
        if (canJumpRef.current && now - lastJumpAtRef.current > 220) {
          // Pogo burst upwards from foot
          const forceMag = 0.055;
          Body.applyForce(player.foot, player.foot.position, { x: 0, y: -forceMag });
          Body.applyForce(player.rod, player.rod.position, { x: 0, y: -forceMag * 0.6 });
          lastJumpAtRef.current = now;
        }
      }

      // Camera follow
      const targetX = player.torso.position.x - canvas.width / (dpr * 2);
      cameraXRef.current += (targetX - cameraXRef.current) * 0.08;
      cameraXRef.current = Math.max(0, cameraXRef.current);

      Engine.update(engine, 1000 / 60);
      draw();
      rafRef.current = requestAnimationFrame(step);
    };

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      // Parallax sky/hills
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cam = cameraXRef.current;

      const drawParallaxHill = (offset: number, color: string, amp: number, baseY: number) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-w, h);
        for (let x = -w; x <= w * 3; x += 16) {
          const y = baseY + Math.sin((x + offset - cam * 0.4) * 0.002) * amp;
          ctx.lineTo(x - cam * 0.4, y);
        }
        ctx.lineTo(w * 3, h);
        ctx.closePath();
        ctx.fill();
      };
      drawParallaxHill(0, "#a0d8ff", 18, h * 0.55);
      drawParallaxHill(200, "#7cc5ff", 22, h * 0.62);

      ctx.translate(-cameraXRef.current, 0);

      const allBodies = Composite.allBodies(engine.world);
      for (const b of allBodies) {
        let color = "#374151";
        if (b.label === "ground" || b.label === "platform") color = "#334155";
        if (b.label === "hazard") color = "#ef4444";
        if (b.label === "finish") color = "#22c55e";
        if (b.label === "rod") color = "#9ca3af";
        if (b.label === "torso") color = "#60a5fa";
        if (b.label === "head") color = "#facc15";
        if (b.label === "foot") color = "#a78bfa";
        if (b.isSensor) {
          ctx.save();
          ctx.globalAlpha = 0.18;
          renderBody(b, color);
          ctx.restore();
        } else {
          renderBody(b, color);
        }
      }

      // Finish banner
      if (finishRef.current) {
        const f = finishRef.current.position;
        ctx.save();
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(f.x - 2, f.y - 140, 4, 280);
        ctx.translate(f.x, f.y - 160);
        ctx.rotate(-0.1);
        ctx.fillStyle = "#16a34a";
        ctx.fillRect(-36, -14, 72, 28);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px ui-sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("FINISH", 0, 4);
        ctx.restore();
      }

      ctx.restore();
    };

    const restart = () => {
      if (!engineRef.current) return;
      setState("playing");
      lastJumpAtRef.current = 0;
      canJumpRef.current = false;
      cameraXRef.current = 0;
      // Remove everything
      const all = Composite.allBodies(engine.world);
      for (const b of all) World.remove(engine.world, b);
      const cons = Composite.allConstraints(engine.world);
      for (const c of cons) World.remove(engine.world, c);
      makeLevel();
      makePlayer();
      setRestartTick((t) => t + 1);
    };

    const loop = requestAnimationFrame(step);
    rafRef.current = loop;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      ro.disconnect();
      Engine.clear(engine);
      engineRef.current = null;
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartTick]);

  return (
    <div className="canvas-wrap">
      {state !== "playing" && (
        <div className="overlay">
          <div className="card">
            <div className="badge">{state === "won" ? "Level Complete" : "You Died"}</div>
            <h2 style={{ marginTop: 4 }}>{state === "won" ? "Victory!" : "Try Again"}</h2>
            <p style={{ opacity: 0.8 }}>{state === "won" ? "Nice pogo skills." : "Watch those spikes."}</p>
            <button className="btn" onClick={() => setRestartTick((t) => t + 1)}>Restart (R)</button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} />
    </div>
  );
}
