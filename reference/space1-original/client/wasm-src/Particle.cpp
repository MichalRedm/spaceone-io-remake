#include "Particle.h"
#include "Game.h"

namespace
{
    std::array<cp5::AtlasFrame*, 7> m_SquareSprites = {{
        Context::GetAtlasFrame("particles/Particle_Blue.png"),
        Context::GetAtlasFrame("particles/Particle_Cyan.png"),
        Context::GetAtlasFrame("particles/Particle_Green.png"),
        Context::GetAtlasFrame("particles/Particle_Orange.png"),
        Context::GetAtlasFrame("particles/Particle_Pink.png"),
        Context::GetAtlasFrame("particles/Particle_Yellow.png"),
        Context::GetAtlasFrame("particles/Particle_Red.png")
   }};

   std::array<cp5::AtlasFrame*, 7> m_CircleSprites = {{
        Context::GetAtlasFrame("particles/Particle_Food_Blue.png"),
        Context::GetAtlasFrame("particles/Particle_Food_Cyan.png"),
        Context::GetAtlasFrame("particles/Particle_Food_Green.png"),
        Context::GetAtlasFrame("particles/Particle_Food_Orange.png"),
        Context::GetAtlasFrame("particles/Particle_Food_Pink.png"),
        Context::GetAtlasFrame("particles/Particle_Food_Yellow.png"),
        Context::GetAtlasFrame("particles/Particle_Food_Red.png")
   }};

   std::array<cp5::AtlasFrame*, 7> m_TriangleSprites = {{
        Context::GetAtlasFrame("ships/Particle_Ship_Blue.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Cyan.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Green.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Orange.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Pink.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Yellow.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Red.png")
   }};
}

void Particle::Update()
{
    m_fX += m_fVelX;
    m_fY += m_fVelY;

    if(m_bIsExplosion)
    {
        if(m_fSize > 0) m_fSize -= m_fDecay;
    }
    else
    {
        if(m_fSize > 0) m_fSize -= m_fDecay / 2;
    }
}

void Particle::Render(Context *ctx)
{
    double width = 0, height = 0;
    // double randomAngle = 0;
    cp5::AtlasFrame* particleImage = NULL;

    ctx->Save();

    ctx->Translate(m_fX, m_fY);
    ctx->SetAlpha(m_fAlpha);

    //Since we may be rotating the context in the switch, it should be after the translate
    switch(m_Type)
    {
        case SQUARE:
            width = ctx->GetImageWidth(m_SquareSprites[m_iSelectedSet]);
            height = ctx->GetImageHeight(m_SquareSprites[m_iSelectedSet]);
            particleImage = m_SquareSprites[m_iSelectedSet];
            break;
        case CIRCLE:
            width = ctx->GetImageWidth(m_CircleSprites[m_iSelectedSet]);
            height = ctx->GetImageHeight(m_CircleSprites[m_iSelectedSet]);
            particleImage = m_CircleSprites[m_iSelectedSet];
            break;
        case TRIANGLE:
            width = ctx->GetImageWidth(m_TriangleSprites[m_iSelectedSet]);
            height = ctx->GetImageHeight(m_TriangleSprites[m_iSelectedSet]);
            particleImage = m_TriangleSprites[m_iSelectedSet];
            // randomAngle = js_get_random_value_from_range(-M_PI, M_PI);
            // ctx->Rotate(randomAngle);
            break;
        default:
            break;
    }

    if(particleImage!=NULL)
    {
        double scale =  height / width;
        double w = m_fSize;
        double h = w * scale;

        if(m_Type == TRIANGLE)
        {
            if(m_fAngle >= 2 * M_PI) m_fAngle = 0;
        
            m_fAngle += 0.05;

            ctx->Rotate(m_fAngle);
        }

        ctx->DrawImageFromAtlas(particleImage, -0.5 * w, h * - 0.5, w, h);
    }

    ctx->Restore();
}

void Particle::ResetValues(double x, double y, double vx, double vy, double size, double decay, double alpha, uint8_t selectedSet, ParticleType type, bool isExplosion)
{
    m_fX = x;
    m_fY = y;
    m_fVelX = vx;
    m_fVelY = vy;
    m_fSize = size;
    m_fDecay = decay;
    m_fAlpha = alpha;
    m_iSelectedSet = selectedSet;
    m_Type = type;
    m_bIsExplosion = isExplosion;
}

