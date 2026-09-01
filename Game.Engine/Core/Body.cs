namespace Game.Engine.Core
{
    using Game.API.Common;
    using RBush;
    using System;
    using System.Numerics;

    public class Body : ISpatialData
    {
        public long ProjectedTime { get; set; }
        private Vector2 _position = Vector2.Zero;
        protected long MaximumCleanTime = 2000;

        public Envelope Envelope;
        private bool ProjectedOnce = false;

        public uint ID { get; set; }
        public uint DefinitionTime { get; set; }
        public Group Group { get; set; }

        public bool Exists { get; set; }
        public bool IsDirty { get; set; } = true;

        public bool Indexed { get; set; } = false;
        public bool Removed { get; set; } = false;
        public bool Updated { get; set; } = false;

        public Vector2 IndexedPosition { get; set; }

        public bool IsStatic { get; set; } = false;

        private int _size;
        public virtual int Size
        {
            get => _size;
            set
            {
                IsDirty = IsDirty || _size != value;
                _size = value;
            }
        }

        private byte _mode;
        public virtual byte Mode
        {
            get => _mode;
            set
            {
                IsDirty = IsDirty || _mode != value;
                _mode = value;
            }
        }

        private Sprites _sprite;
        public virtual Sprites Sprite
        {
            get => _sprite;
            set
            {
                IsDirty = IsDirty || _sprite != value;
                _sprite = value;
            }
        }

        private string _color;
        public virtual string Color
        {
            get => _color;
            set
            {
                IsDirty = IsDirty || _color != value;
                _color = value;
            }
        }

        private float _angularVelocity;
        public virtual float AngularVelocity
        {
            get => _angularVelocity;
            set
            {
                IsDirty = IsDirty || _angularVelocity != value;
                _angularVelocity = value;
            }
        }

        private float _originalAngle;
        public virtual float OriginalAngle
        {
            get => _originalAngle;
            set
            {
                IsDirty = IsDirty || _originalAngle != value;
                _originalAngle = value;
            }
        }

        private Vector2 _momentum = Vector2.Zero;
        public virtual Vector2 Momentum
        {
            get => _momentum;
            set
            {
                if (float.IsNaN(value.X) || float.IsNaN(value.Y) || float.IsInfinity(value.X) || float.IsInfinity(value.Y))
                    throw new ArgumentException("Invalid momentum vector", nameof(value));
                IsDirty = IsDirty || _momentum != value;
                _momentum = value;
            }
        }

        private Vector2 _originalPosition = Vector2.Zero;
        public virtual Vector2 OriginalPosition
        {
            get => _originalPosition;
            set
            {
                IsDirty = IsDirty || _originalPosition != value;
                _originalPosition = value;
            }
        }

        public virtual Vector2 Position
        {
            set
            {
                if (_position != value)
                {
                    if (float.IsNaN(value.X) || float.IsNaN(value.Y) || float.IsInfinity(value.X) || float.IsInfinity(value.Y))
                        throw new ArgumentException("Invalid position vector", nameof(value));
                    _position = value;
                    IsDirty = true;
                }
            }
            get => _position;
        }

        private float _angle = 0;
        public virtual float Angle
        {
            set
            {
                if (_angle != value)
                {
                    if (float.IsNaN(value) || float.IsInfinity(value))
                        throw new ArgumentException("Invalid angle value", nameof(value));

                    _angle = value;
                    IsDirty = true;
                }
            }
            get => _angle;
        }

        ref readonly Envelope ISpatialData.Envelope => ref this.Envelope;

        public void Project(uint time)
        {
            if (IsStatic)
            {
                if (!ProjectedOnce)
                {
                    _position = _originalPosition;
                    _angle = _originalAngle;
                    Envelope = new Envelope(_position.X - Size, _position.Y - Size, _position.X + Size, _position.Y + Size);
                    ProjectedOnce = true;
                }
            }
            else
            {
                ProjectedTime = time;
                if (DefinitionTime == 0)
                    DefinitionTime = time;

                var timeDelta = (time - this.DefinitionTime);

                _position = Vector2.Add(OriginalPosition, Vector2.Multiply(Momentum, timeDelta));

                _angle = OriginalAngle + timeDelta * AngularVelocity;

                if (time - this.DefinitionTime > MaximumCleanTime)
                    this.IsDirty = true;
            }
        }

        public void Update(uint time)
        {
            if (IsDirty)
            {
                DefinitionTime = time;
                OriginalPosition = Position;
                OriginalAngle = Angle;
                IsDirty = false;
            }
        }

        public Body Clone()
        {
            return this.MemberwiseClone() as Body;
        }

    }
}
