#ifndef PARTICLESYSTEM__H
#define PARTICLESYSTEM__H

#include "Particle.h"

#define MAX_PARTICLES 10

class ParticleSystem
{
public:
    ParticleSystem() { BootstrapParticles(MAX_PARTICLES); }
    ~ParticleSystem() {}

    void Update();
    void Render(Context* ctx);
    void BootstrapParticles(uint32_t maxNumParticles);
    void MakeParticleTrail(double minAngle, double maxAngle, double velX, double velY, double size, double decay, double delay, double alpha, uint8_t selectedSet, uint32_t numParticles, double x, double y);
    void MakeParticleExplosion(double minAngle, double maxAngle, double maxSpeed, double size, double decay, double alpha, uint8_t selectedSet, uint32_t numParticles, double x, double y, Particle::ParticleType type);
    void ClearParticles();

    inline bool HasBeenUsed() { return m_bForceReuse || (m_bHasRecycledAParticle && m_UnavailableParticles.size() == 0); }
    inline void ForceReuse() { m_bForceReuse = true; }
    inline void Reset() { m_bHasRecycledAParticle = false; m_bForceReuse = false; }

private:
    std::shared_ptr<Particle> GetAvailableParticle();

    std::vector<std::shared_ptr<Particle>> m_AvailableParticles;
    std::vector<std::shared_ptr<Particle>> m_UnavailableParticles;
    bool m_bHasRecycledAParticle = false;
    bool m_bForceReuse = false;
    double m_fParticleCreationTime = 0.0;
};

#endif