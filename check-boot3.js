(() => {
  const b = window.game.world.buildings;
  return JSON.stringify({
    boot: !!window.game,
    buildings: b.length,
    state: window.game.state,
    near: b.filter((f) => f.poi).length,
  });
})();
