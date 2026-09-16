namespace Game.API.Common
{
    public enum GroupTypes : byte
    {
        // actors
        Food,
        Fish = Food,
        Fleet,

        // other
        Obstacle,

        // munitions
        VolleyBullet,
        VolleySeeker,
        PickupSeeker,

        Map
    }
}
