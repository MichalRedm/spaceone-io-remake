namespace Game.Util.Commands
{
    using McMaster.Extensions.CommandLineUtils;
    using System;
    using System.Linq;
    using System.Threading.Tasks;

    [Command("server")]
    [Subcommand(typeof(Get), typeof(Reset), typeof(Announce), typeof(Connections))]
    class ServerCommand : CommandBase
    {
        private static string[] Worlds = new[]
        {
            "default",
            "duel",
            "team",
            "ctf"
        };

        private static string[] WorldSelection(string world)
        {
            if (world == null)
                return Worlds;
            else
                return new[] { world };
        }

        [Command("get")]
        class Get : CommandBase
        {
            protected async override Task ExecuteAsync()
            {
                var started = DateTime.Now;

                var server = await API.Server.ServerGetAsync();

                Table("Server", new
                {
                    Server = API.BaseURL.ToString(),
                    ms = DateTime.Now.Subtract(started).TotalMilliseconds,
                    Players = server.PlayerCount
                });
            }
        }

        [Command("reset")]
        class Reset : CommandBase
        {
            protected async override Task ExecuteAsync()
            {
                await API.Server.ServerResetAsync();
            }
        }

        [Command("announce")]
        class Announce : CommandBase
        {
            [Argument(0)]
            public string Message { get; set; } = null;

            [Option]
            public string World { get; set; } = null;

            protected async override Task ExecuteAsync()
            {
                if (Message != null)
                {
                    foreach (var world in WorldSelection(World))
                        await API.Server.AnnounceAsync(Message, world);
                }
            }
        }

        [Command("connections")]
        class Connections : CommandBase
        {
            [Option]
            public string World { get; set; } = null;

            [Option]
            public bool IP { get; set; } = false;

            [Option("--json", Description = "Output raw JSON suitable for scripting")]
            public bool Json { get; set; } = false;

            [Option("--full-ids", Description = "Display full 32-char PlayerID values")]
            public bool FullIds { get; set; } = false;

            protected async override Task ExecuteAsync()
            {
                var allResults = new System.Collections.Generic.Dictionary<string, System.Collections.Generic.IEnumerable<Game.API.Common.Models.GameConnection>>();

                foreach (var world in WorldSelection(World))
                {
                    var connections = await API.Server.ConnectionsAsync(world);
                    if (Json)
                    {
                        allResults[world] = connections;
                        continue;
                    }

                    Table($"Connections - {world}", connections.Select(c =>
                        new
                        {
                            id = FullIds ? c.PlayerID : (c.PlayerID?.Length > 8 ? c.PlayerID.Substring(0, 8) : c.PlayerID),
                            fleet = c.FleetID,
                            c.Name,
                            ip = IP ? c.IP : string.Empty,
                            c.IsAlive,
                            c.Score,
                            ships = c.FleetSize,
                            c.Color,
                            bot = c.IsBot,
                            fps = c.ClientFPS,
                            vps = c.ClientVPS,
                            ups = c.ClientUPS,
                            ping = c.Latency
                        }));
                }

                if (Json)
                {
                    Console.WriteLine(Newtonsoft.Json.JsonConvert.SerializeObject(allResults, Newtonsoft.Json.Formatting.Indented));
                }
            }
        }
    }
}
