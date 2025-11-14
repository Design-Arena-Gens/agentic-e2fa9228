import GameCanvas from "../components/GameCanvas";

export default function Page() {
  return (
    <main>
      <header className="ui">
        <h1>Pogo Stickman</h1>
        <p>Arrow keys to move/lean, Up to pogo jump, R to restart.</p>
      </header>
      <GameCanvas />
    </main>
  );
}
