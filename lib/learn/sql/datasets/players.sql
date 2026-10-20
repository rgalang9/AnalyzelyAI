CREATE TABLE players (
  player_id INTEGER PRIMARY KEY,
  username TEXT,
  country TEXT,
  signup_date TEXT,
  hours_played INTEGER
);

INSERT INTO players VALUES
(1, 'ShadowFox', 'USA', '2021-03-14', 320),
(2, 'pixelqueen', 'Canada', '2022-07-02', 145),
(3, 'NoScopeNate', 'USA', '2020-11-23', 610),
(4, 'luna_plays', 'Japan', '2023-01-09', 88),
(5, 'BlockBuilder', 'UK', '2021-08-30', 275),
(6, 'speedy_g', 'Brazil', '2024-05-17', 40),
(7, 'CaptainCrit', 'Philippines', '2022-12-05', 198),
(8, 'mochi', 'Japan', '2024-02-29', 12),
(9, 'TurboTaco', 'Mexico', '2023-06-21', 133),
(10, 'xXDragonXx', 'USA', '2021-03-01', 502);