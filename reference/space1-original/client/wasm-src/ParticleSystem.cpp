#include "ParticleSystem.h"
#include "Game.h"

void ParticleSystem::MakeParticleTrail(double minAngle, double maxAngle, double velX, double velY, double size, double decay, double delay, double alpha, uint8_t selectedSet, uint32_t numParticles, double x, double y)
{
    double timeSinceLastParticle = g_Game.Now() - m_fParticleCreationTime;
    double actualDelay = js_get_random_value_from_range(delay * 0.7, delay);
    if(timeSinceLastParticle > actualDelay)
    {
        if(m_UnavailableParticles.size() < numParticles)
        {
            m_fParticleCreationTime = g_Game.Now();
            auto particle = GetAvailableParticle();

            if(particle == nullptr) return;

            double angle = js_get_random_value_from_range(minAngle, maxAngle);
            double randomAlpha = js_get_random_value_from_range(0.5, alpha);
            x += cos(angle) * 3;
            y += sin(angle) * 3;

            particle->ResetValues(x, y, velX, velY, size, decay, randomAlpha, selectedSet, Particle::ParticleType::SQUARE, false);
        }
    }
}

void ParticleSystem::MakeParticleExplosion(double minAngle, double maxAngle, double maxSpeed, double size, double decay, double alpha, uint8_t selectedSet, uint32_t numParticles, double x, double y, Particle::ParticleType type)
{
    for(int i = 0; i < numParticles; i++)
    {
        auto particle = GetAvailableParticle();

        if(particle == nullptr) continue;

        double angle = js_get_random_value_from_range(minAngle, maxAngle);
        double speed = js_get_random_value_from_range(maxSpeed * 0.3, maxSpeed);

        if(type == Particle::ParticleType::TRIANGLE) size = js_get_random_value_from_range(size * 0.5, size);
        double vx = cos(angle) * (speed);
        double vy = sin(angle) * (speed);

        particle->ResetValues(x, y, vx, vy, size, decay, alpha, selectedSet, type, true);
    }
}

void ParticleSystem::BootstrapParticles(uint32_t maxNumParticles)
{
    for(int i = 0; i < MAX_PARTICLES; i++)
    {
        m_AvailableParticles.push_back(std::make_shared<Particle>());
    }
}

std::shared_ptr<Particle> ParticleSystem::GetAvailableParticle()
{
    auto numAvailableParticles = m_AvailableParticles.size();

    if(numAvailableParticles > 0)
    {
        auto particle = m_AvailableParticles.back();
        m_UnavailableParticles.push_back(particle);
        m_AvailableParticles.pop_back();
        return particle;
    }
    else
    {
        Debug("No available particles at particle system");
        return nullptr;
    }
}

void ParticleSystem::Update()
{
    for(auto it = m_UnavailableParticles.begin(); it != m_UnavailableParticles.end();)
    {
        (*it)->Update();

        if (!(*it)->ShouldRender())
        {
            m_AvailableParticles.push_back((*it));
            it = m_UnavailableParticles.erase(it);
            m_bHasRecycledAParticle = true;
        }
        else
        {
            it++;
        }
    }
}

void ParticleSystem::Render(Context *ctx)
{
    ctx->Save();

    ctx->SetGlobalCompositeOperation("lighter");

    for(std::shared_ptr<Particle> particle : m_UnavailableParticles)
    {
        if(particle->ShouldRender())
        {
            particle->Render(ctx);
        }
    }

    ctx->Restore();
}

void ParticleSystem::ClearParticles()
{
    for(auto it = m_UnavailableParticles.begin(); it != m_UnavailableParticles.end();)
    {
        m_AvailableParticles.push_back((*it));
        it = m_UnavailableParticles.erase(it);
    }
}

