namespace Game.Engine.Networking
{
    using Game.Engine.Core;
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;

    public class BodyCache
    {
        private readonly Dictionary<long, BucketBody> Bodies = new Dictionary<long, BucketBody>();
        private readonly Dictionary<long, BucketGroup> Groups = new Dictionary<long, BucketGroup>();

        private readonly List<BucketBody> _bodiesByErrorList = new List<BucketBody>();
        private readonly List<BucketGroup> _groupsByErrorList = new List<BucketGroup>();
        private readonly List<BucketBody> _staleBodiesList = new List<BucketBody>();
        private readonly List<BucketGroup> _staleGroupsList = new List<BucketGroup>();

        public void Update(IEnumerable<Body> bodies, uint time)
        {
            // update cache items and flag missing ones as stale
            UpdateLocalBodies(bodies);

            // project the current bodies and calculate errors
            foreach (var bucket in Bodies.Values)
                bucket.Project(time);

            foreach (var bucket in Groups.Values)
                bucket.CalculateError();
        }

        public List<BucketBody> BodiesByError()
        {
            // find the bodies with the largest error
            _bodiesByErrorList.Clear();
            foreach (var b in Bodies.Values)
            {
                if (!b.Stale && b.Error > 0)
                    _bodiesByErrorList.Add(b);
            }
            _bodiesByErrorList.Sort((a, b) => b.Error.CompareTo(a.Error));
            return _bodiesByErrorList;
        }

        public List<BucketGroup> GroupsByError()
        {
            // find the groups with the largest error
            _groupsByErrorList.Clear();
            foreach (var g in Groups.Values)
            {
                if (!g.Stale && g.Error > 0)
                    _groupsByErrorList.Add(g);
            }
            _groupsByErrorList.Sort((a, b) => b.Error.CompareTo(a.Error));
            return _groupsByErrorList;
        }

        private void UpdateLocalGroups(IEnumerable<Group> groups)
        {
            foreach (var bucket in Groups.Values)
                bucket.Stale = true;

            foreach (var obj in groups)
            {
                if (Groups.TryGetValue(obj.ID, out var bucket))
                {
                    bucket.Stale = false;
                }
                else
                {
                    Groups.Add(obj.ID, new BucketGroup
                    {
                        GroupUpdated = obj,
                        Stale = false
                    });
                }
            }
        }

        private void UpdateLocalBodies(IEnumerable<Body> bodies)
        {
            foreach (var bucket in Groups.Values)
                bucket.Stale = true;

            foreach (var bucket in Bodies.Values)
                bucket.Stale = true;

            foreach (var obj in bodies)
            {
                if (Bodies.TryGetValue(obj.ID, out var bodyBucket))
                {
                    bodyBucket.Stale = false;
                    bodyBucket.BodyUpdated = obj;
                }
                else
                {
                    Bodies.Add(obj.ID, new BucketBody
                    {
                        BodyUpdated = obj,
                        Stale = false
                    });
                }

                if (obj.Group != null)
                {
                    if (Groups.TryGetValue(obj.Group.ID, out var groupBucket))
                    {
                        groupBucket.Stale = false;
                    }
                    else
                    {
                        Groups.Add(obj.Group.ID, new BucketGroup
                        {
                            GroupUpdated = obj.Group,
                            Stale = false
                        });
                    }
                }
            }
        }

        public List<BucketBody> CollectStaleBuckets()
        {
            _staleBodiesList.Clear();
            foreach (var b in Bodies.Values)
            {
                if (b.Stale)
                    _staleBodiesList.Add(b);
            }

            for (int i = 0; i < _staleBodiesList.Count; i++)
                Bodies.Remove(_staleBodiesList[i].BodyUpdated.ID);

            return _staleBodiesList;
        }

        public List<BucketGroup> CollectStaleGroups()
        {
            _staleGroupsList.Clear();
            foreach (var g in Groups.Values)
            {
                if (g.Stale)
                    _staleGroupsList.Add(g);
            }

            for (int i = 0; i < _staleGroupsList.Count; i++)
                Groups.Remove(_staleGroupsList[i].GroupUpdated.ID);

            return _staleGroupsList;
        }

        public class BucketGroup
        {
            public Group GroupUpdated { get; set; }
            public Group GroupClient { get; set; }

            public bool Stale { get; set; }
            public float Error { get; set; }

            public void CalculateError()
            {
                if (GroupClient == null
                    || GroupClient.CustomData != GroupUpdated.CustomData
                    || GroupClient.Color != GroupUpdated.Color
                    || GroupClient.GroupType != GroupUpdated.GroupType
                    || GroupClient.Caption != GroupUpdated.Caption
                    )

                    Error = 1;
                else
                    Error = 0;
            }
        }

        public class BucketBody
        {
            public Body BodyUpdated { get; set; }
            public Body BodyClient { get; set; }

            public float Error { get; set; }
            public bool Stale { get; set; }

            private const int DISTANCE_THRESHOLD = 0;
            private const float WEIGHT_DISTANCE = 1;
            private const float WEIGHT_ANGLE = 10;
            private const float WEIGHT_SPRITE = 1;
            private const float WEIGHT_SIZE = 1;
            private const float WEIGHT_MODE = 1;
            private const float WEIGHT_MISSING = float.MaxValue;

            public void Project(uint time)
            {
                if (BodyClient != null)
                {
                    if (BodyClient.DefinitionTime == BodyUpdated.DefinitionTime)
                        Error = 0;
                    else
                    {
                        BodyClient.Project(time);
                        var distance = Vector2.Distance(BodyClient.Position, BodyUpdated.Position);
                        Error =
                            (distance > DISTANCE_THRESHOLD
                                ? WEIGHT_DISTANCE * distance
                                : 0f)
                            + WEIGHT_ANGLE * MathF.Abs(BodyClient.Angle - BodyUpdated.Angle)
                            + WEIGHT_SIZE * MathF.Abs(BodyClient.Size - BodyUpdated.Size)
                            + WEIGHT_MODE * MathF.Abs(BodyClient.Mode - BodyUpdated.Mode)
                            + WEIGHT_SPRITE * (BodyClient.Sprite != BodyUpdated.Sprite ? 1f : 0f);
                    }
                }
                else
                    Error = WEIGHT_MISSING;
            }
        }
    }
}
