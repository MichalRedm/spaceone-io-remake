namespace Game.Engine.Controllers
{
    using Game.API.Common.Models;
    using Game.API.Common.Security;
    using Game.Engine.Core;
    using Microsoft.AspNetCore.Authorization;
    using Microsoft.AspNetCore.Cors;
    using Microsoft.AspNetCore.Mvc;
    using Newtonsoft.Json;
    using System.Collections.Generic;
    using System.IO;
    using System.Linq;
    using System.Text;
    using System.Threading.Tasks;

    public class ServerController : APIControllerBase
    {
        public ServerController(ISecurityContext securityContext)
             : base(securityContext)
        {
        }

        [HttpGet, AllowAnonymous]
        public Server Get()
        {
            var world = Worlds.Find();
            int playerCount;
            lock (world.Bodies)
            {
                playerCount = Player.GetWorldPlayers(world).Count(p => p != null && !p.IsObserver);
            }

            return new Server
            {
                PlayerCount = playerCount,
                WorldCount = Worlds.AllWorlds.Count
            };
        }

        [HttpPost, Route("reset")]
        public bool Reset()
        {
            Program.Abort();

            return true;
        }

        [HttpPost, Route("announce")]
        public bool Announce(string message, string worldName = null)
        {
            var world = Worlds.Find(worldName);
            var players = Player.GetWorldPlayers(world);
            foreach (var player in players)
                player.SendMessage(message);

            return true;
        }

        [HttpGet, Route("players"), AllowAnonymous]
        public IEnumerable<GameConnection> GetPlayers(string worldName = null, bool includeObservers = false)
        {
            var world = Worlds.Find(worldName);
            if (world == null)
                return Enumerable.Empty<GameConnection>();

            bool isAdmin = (this.SecurityContext?.IsAuthenticated ?? false)
                && (this.SecurityContext?.SecurityIdentifiers?.Contains("Admin") ?? false);

            lock (world.Bodies)
            {
                return Player.GetWorldPlayers(world)
                    .Where(p => p != null && (includeObservers || !p.IsObserver))
                    .Select(p =>
                    {
                        var pos = p.Fleet != null ? p.Fleet.FleetCenter : (p.DeathPosition ?? System.Numerics.Vector2.Zero);
                        return new GameConnection
                        {
                            PlayerID = p.PlayerID,
                            FleetID = p.Fleet?.ID ?? 0,
                            FleetSize = p.Fleet?.Ships?.Count ?? 0,
                            Name = p.Name,
                            Color = p.Color,
                            Score = p.Score,
                            IsAlive = p.IsAlive,
                            IsBot = p is Robot,
                            IsSpectating = p.Connection?.IsSpectating ?? false,
                            IsObserver = p.IsObserver,
                            PositionX = pos.X,
                            PositionY = pos.Y,
                            KillCount = p.KillCount,
                            DeathCount = p.DeathCount,
                            IP = isAdmin ? p.IP : "[REDACTED]",
                            Backgrounded = p.Connection?.Backgrounded ?? false,
                            ClientFPS = p.Connection?.ClientFPS ?? 0,
                            ClientVPS = p.Connection?.ClientVPS ?? 0,
                            ClientUPS = p.Connection?.ClientUPS ?? 0,
                            ClientCS = p.Connection?.ClientCS ?? 0,
                            Bandwidth = p.Connection?.Bandwidth ?? 0,
                            Latency = p.Connection?.Latency ?? 0
                        };
                    })
                    .ToList();
            }
        }
    }
}
