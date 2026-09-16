namespace Game.Robots.Models
{
    using Game.API.Common;
    using System.Collections.Generic;
    using System.Numerics;

    public class Fleet
    {
        public string Name { get; set; }
        public uint ID { get; set; }
        public Sprites Sprite { get; set; }
        public string Color { get; set; }
        public bool PendingDestruction { get; set; }

        public List<Ship> Ships { get; set; } = new List<Ship>();

        public Dictionary<string, object> Notes { get; set; } = new Dictionary<string, object>();

        private Vector2? _center;
        public Vector2 Center
        {
            get
            {
                if (_center.HasValue) return _center.Value;

                Vector2 acc = new Vector2(0, 0);

                foreach (var ship in Ships)
                    acc += ship.Position;

                if (Ships.Count > 0)
                    _center = acc / Ships.Count;
                else
                    _center = Vector2.Zero;

                return _center.Value;
            }
        }

        private Vector2? _momentum;
        public Vector2 Momentum
        {
            get
            {
                if (_momentum.HasValue) return _momentum.Value;

                Vector2 acc = new Vector2(0, 0);

                foreach (var ship in Ships)
                    acc += ship.Momentum;

                if (Ships.Count > 0)
                    _momentum = acc / Ships.Count;
                else
                    _momentum = Vector2.Zero;

                return _momentum.Value;
            }
        }

        public void ClearCache()
        {
            _center = null;
            _momentum = null;
        }

        public void SetMomentumAndPos(Vector2 po, Vector2 mo)
        {
            Vector2 curpo = po - this.Center;
            Vector2 curmo = mo - this.Momentum;
            foreach (var s in this.Ships)
            {
                s.Momentum = s.Momentum + curmo;
                s.Position = s.Position + curpo;
            }
            ClearCache();
        }
        public Fleet Clone()
        {
            Fleet nf = new Fleet();
            nf.Name = this.Name;
            nf.ID = this.ID;
            nf.Sprite = this.Sprite;
            nf.Color = this.Color;
            nf.PendingDestruction = this.PendingDestruction;
            nf.Ships = new List<Ship>();
            foreach (var s in this.Ships)
            {
                nf.Ships.Add(s.Clone());
            }
            return nf;
        }
    }
}
