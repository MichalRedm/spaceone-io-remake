#ifndef PARTICLE__H
#define PARTICLE__H

class Particle
{
public:
    enum ParticleType
    {
        TRIANGLE,
        CIRCLE,
        SQUARE
    };

    inline bool ShouldRender() { return m_fSize >= 0.01; }

    void Render(Context *ctx);
    void Update();
    void ResetValues(double x, double y, double vx, double vy, double size, double decay, double alpha, uint8_t selectedSet, ParticleType type, bool isExplosion);

private:
    double m_fX = 0.0;
    double m_fY = 0.0;
    double m_fVelX = 0.0;
    double m_fVelY = 0.0;
    double m_fSize = 1.0;
    double m_fDecay = 1.0;
    double m_fAlpha = 1.0;
    double m_fAngle = 0;
    bool m_bIsExplosion = false;
    uint8_t m_iSelectedSet;
    ParticleType m_Type;
};

#endif