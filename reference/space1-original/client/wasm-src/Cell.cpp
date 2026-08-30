#include "stdafx.h"
#include "Cell.h"
#include "Game.h"
#include "Screen.h"

#define INTERP_TIME 100.0
#define PULSE_INC_VALUE 0.035f

#define ACCELERATION_END MAX_DASH_TICKS / 5
#define DESACCELERATION_END MAX_DASH_TICKS

namespace {    
    std::array<cp5::AtlasFrame*, 7> m_Ships = {{
        Context::GetAtlasFrame("ships/Ship_Blue.png"),
        Context::GetAtlasFrame("ships/Ship_Cyan.png"),
        Context::GetAtlasFrame("ships/Ship_Green.png"),
        Context::GetAtlasFrame("ships/Ship_Orange.png"),
        Context::GetAtlasFrame("ships/Ship_Pink.png"),
        Context::GetAtlasFrame("ships/Ship_Yellow.png"),
        Context::GetAtlasFrame("ships/Ship_Red.png")
    }};

    std::array<cp5::AtlasFrame*, 7> m_DeadShips = {{
        Context::GetAtlasFrame("ships/Dead_Ship_Blue.png"),
        Context::GetAtlasFrame("ships/Dead_Ship_Cyan.png"),
        Context::GetAtlasFrame("ships/Dead_Ship_Green.png"),
        Context::GetAtlasFrame("ships/Dead_Ship_Orange.png"),
        Context::GetAtlasFrame("ships/Dead_Ship_Pink.png"),
        Context::GetAtlasFrame("ships/Dead_Ship_Yellow.png"),
        Context::GetAtlasFrame("ships/Dead_Ship_Red.png")
    }};

    std::array<cp5::AtlasFrame*, 7> m_DashShips = {{
        Context::GetAtlasFrame("ships/Particle_Ship_Blue.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Cyan.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Green.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Orange.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Pink.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Yellow.png"),
        Context::GetAtlasFrame("ships/Particle_Ship_Red.png")
    }};

    std::array<cp5::AtlasFrame*, 7> m_ShipTrails = {{
        Context::GetAtlasFrame("ships/Dash_Trail_Blue.png"),
        Context::GetAtlasFrame("ships/Dash_Trail_Cyan.png"),
        Context::GetAtlasFrame("ships/Dash_Trail_Green.png"),
        Context::GetAtlasFrame("ships/Dash_Trail_Orange.png"),
        Context::GetAtlasFrame("ships/Dash_Trail_Pink.png"),
        Context::GetAtlasFrame("ships/Dash_Trail_Yellow.png"),
        Context::GetAtlasFrame("ships/Dash_Trail_Red.png")
    }};

   std::array<cp5::AtlasFrame*, 7> m_Lasers = {{
        Context::GetAtlasFrame("lasers/Laser_Blue.png"),
        Context::GetAtlasFrame("lasers/Laser_Cyan.png"),
        Context::GetAtlasFrame("lasers/Laser_Green.png"),
        Context::GetAtlasFrame("lasers/Laser_Orange.png"),
        Context::GetAtlasFrame("lasers/Laser_Pink.png"),
        Context::GetAtlasFrame("lasers/Laser_Yellow.png"),
        Context::GetAtlasFrame("lasers/Laser_Red.png")
   }};

   std::array<cp5::AtlasFrame*, 7> m_LaserTrails = {{
        Context::GetAtlasFrame("lasers/Laser_Blue_Trail.png"),
        Context::GetAtlasFrame("lasers/Laser_Cyan_Trail.png"),
        Context::GetAtlasFrame("lasers/Laser_Green_Trail.png"),
        Context::GetAtlasFrame("lasers/Laser_Orange_Trail.png"),
        Context::GetAtlasFrame("lasers/Laser_Pink_Trail.png"),
        Context::GetAtlasFrame("lasers/Laser_Yellow_Trail.png"),
        Context::GetAtlasFrame("lasers/Laser_Red_Trail.png")
   }};
   
   std::array<cp5::AtlasFrame*, 7> m_Foods = {{
        Context::GetAtlasFrame("foods/Food_Blue.png"),
        Context::GetAtlasFrame("foods/Food_Cyan.png"),
        Context::GetAtlasFrame("foods/Food_Green.png"),
        Context::GetAtlasFrame("foods/Food_Orange.png"),
        Context::GetAtlasFrame("foods/Food_Pink.png"),
        Context::GetAtlasFrame("foods/Food_Yellow.png"),
        Context::GetAtlasFrame("foods/Food_Red.png")
   }};
    
    std::array<cp5::AtlasFrame*, 7> m_FoodsGlow = {{
        Context::GetAtlasFrame("foods/Food_Blue_Glow.png"),
        Context::GetAtlasFrame("foods/Food_Cyan_Glow.png"),
        Context::GetAtlasFrame("foods/Food_Green_Glow.png"),
        Context::GetAtlasFrame("foods/Food_Orange_Glow.png"),
        Context::GetAtlasFrame("foods/Food_Pink_Glow.png"),
        Context::GetAtlasFrame("foods/Food_Yellow_Glow.png"),
        Context::GetAtlasFrame("foods/Food_Red_Glow.png")
    }};
   
   std::array<cp5::AtlasFrame*, 24> m_Armours = {{
        Context::GetAtlasFrame("ships/Ship_Blue_Upgrade_1.png"),
        Context::GetAtlasFrame("ships/Ship_Blue_Upgrade_2.png"),
        Context::GetAtlasFrame("ships/Ship_Blue_Upgrade_3.png"),
        Context::GetAtlasFrame("ships/Ship_Cyan_Upgrade_1.png"),
        Context::GetAtlasFrame("ships/Ship_Cyan_Upgrade_2.png"),
        Context::GetAtlasFrame("ships/Ship_Cyan_Upgrade_3.png"),
        Context::GetAtlasFrame("ships/Ship_Green_Upgrade_1.png"),
        Context::GetAtlasFrame("ships/Ship_Green_Upgrade_2.png"),
        Context::GetAtlasFrame("ships/Ship_Green_Upgrade_3.png"),
        Context::GetAtlasFrame("ships/Ship_Orange_Upgrade_1.png"),
        Context::GetAtlasFrame("ships/Ship_Orange_Upgrade_2.png"),
        Context::GetAtlasFrame("ships/Ship_Orange_Upgrade_3.png"),
        Context::GetAtlasFrame("ships/Ship_Pink_Upgrade_1.png"),
        Context::GetAtlasFrame("ships/Ship_Pink_Upgrade_2.png"),
        Context::GetAtlasFrame("ships/Ship_Pink_Upgrade_3.png"),
        Context::GetAtlasFrame("ships/Ship_Yellow_Upgrade_1.png"),
        Context::GetAtlasFrame("ships/Ship_Yellow_Upgrade_2.png"),
        Context::GetAtlasFrame("ships/Ship_Yellow_Upgrade_3.png"),
        Context::GetAtlasFrame("ships/Ship_Red_Upgrade_1.png"),
        Context::GetAtlasFrame("ships/Ship_Red_Upgrade_2.png"),
        Context::GetAtlasFrame("ships/Ship_Red_Upgrade_3.png"),
        Context::GetAtlasFrame("ships/Ship_Grey_Upgrade_1.png"),
        Context::GetAtlasFrame("ships/Ship_Grey_Upgrade_2.png"),
        Context::GetAtlasFrame("ships/Ship_Grey_Upgrade_3.png")
   }};
}


bool Cell::IsOnScreen(){
	if(m_fX + m_fRadius + 40 < g_Game.Rendering()->GetCameraX() - g_Screen.width  / 2 / g_Game.Rendering()->GetZoom()) return false;
	if(m_fY + m_fRadius + 40 < g_Game.Rendering()->GetCameraY() - g_Screen.height / 2 / g_Game.Rendering()->GetZoom()) return false;
	if(m_fX - m_fRadius - 40 > g_Game.Rendering()->GetCameraX() + g_Screen.width  / 2 / g_Game.Rendering()->GetZoom()) return false;
	if(m_fY - m_fRadius - 40 > g_Game.Rendering()->GetCameraY() + g_Screen.height / 2 / g_Game.Rendering()->GetZoom()) return false;
	return true;
}

void Cell::UpdatePos()
{
    if (IsBullet()) return;
    
    double t = GetInterpolationTime();

	m_fX = t * (m_fNewX - m_fOldX) + m_fOldX;
    m_fY = t * (m_fNewY - m_fOldY) + m_fOldY;
    
    m_fVelX = t * (m_fNewVelX - m_fOldVelX) + m_fOldVelX;
    m_fVelY = t * (m_fNewVelY - m_fOldVelY) + m_fOldVelY;

}

void Cell::Destroy(bool isMine){
	if(m_bDestroyed) return;
	m_bDestroyed = true;

    if(!IsFood())
    {    
        if(m_pFleet != nullptr)
        {
            m_pFleet->RemoveCellFromFleet(this);
            m_pFleet = nullptr;
        }
    }

	g_Game.Cells()->DestroyCell(this, isMine);
}

double Cell::CalcVelocityNorm() {
	double dirX = m_fNewX - m_fOldX;
	double dirY = m_fNewY - m_fOldY;
	return sqrt(dirX*dirX + dirY*dirY);
}

void Cell::Render(Context *ctx)
{ 
    ++m_iDrawCount;
	
    if (IsBullet())
        ((Bullet*)this)->UpdatePos();
    else
        UpdatePos();

	ctx->Save();
	
	m_fDrawTime = g_Game.Now();
	
	ctx->SetLineWidth(1);
	ctx->SetLineCap(cp5::CTX_LINE_CAP_ROUND);
	ctx->SetLineJoin(cp5::CTX_LINE_JOIN_ROUND);

    Color color;

    if(m_pFleet != nullptr && !IsFood())
    {
        color = m_pFleet->GetColor();
    }
    else
    {
        //Case its food
        color = Color{0xFF, 0xFF, 0xFF};
    }
    
    bool IsBoid = !IsFood() && !IsBullet();
    
    if(IsBullet())
    {
        if (m_pFleet == nullptr)
            return;

        ctx->Save();
        ctx->Translate(m_fX, m_fY);
        DrawBulletWithTrail(ctx);

        ctx->Restore();
    }
    else if(IsFood())
    {
        if(m_fAlpha < 1.0) { m_fAlpha += 0.01; }

        ctx->SetAlpha(m_fAlpha);
        
        double baseSize = 2.2f*m_fRadius;
        
        m_fFoodRot + m_fFoodRotRndInc > 2*M_PI ? m_fFoodRot = 0 : m_fFoodRot += m_fFoodRotRndInc;
        
        int foodIndex = 0;
        
        if (GetID() % 10 < 2) {
            foodIndex = 0;
        } else if (GetID() % 10 < 4) {
            foodIndex = 1;
        } else if (GetID() % 10 < 6) {
            foodIndex = 2;
        } else if (GetID() % 10 < 8) {
            foodIndex = 3;
        } else {
            foodIndex = 4;
        }
        
        double w = baseSize;
        double h = baseSize;

        m_iFoodIndex = foodIndex;
        
        ctx->SetGlobalCompositeOperation("lighter");
        
        ctx->DrawImageFromAtlas(m_Foods[foodIndex], m_fX-0.5*w, m_fY-0.5*h, w, h);
        
        w = 8.5*m_fRadius*m_fPulseValue*m_fPulseValue;
        h = 8.5*m_fRadius*m_fPulseValue*m_fPulseValue;
        
        
        ctx->DrawImageFromAtlas(m_FoodsGlow[foodIndex], m_fX-0.5*w, m_fY-0.5*h, w, h);
        
    }
    else if (IsBoid && m_pFleet != nullptr)
    {
        //If its spawn protected we make it flicker by only drawing every 6th frame
        if(m_pFleet->IsSpawnProtected() && m_iDrawCount % 10 == 0) m_bSpawnProtectionDraw = !m_bSpawnProtectionDraw;
        if(!m_pFleet->IsSpawnProtected()) m_bSpawnProtectionDraw = false;
        if(m_bSpawnProtectionDraw) { ctx->Restore(); return; }

        bool isInterpolating = g_Game.Configuration()->IsInterpolatingEnabled();
        
        if (IsSplitting()) {
            m_fAngle + m_fFoodRotRndInc > 2*M_PI ? m_fAngle = 0 : m_fAngle += m_fFoodRotRndInc*0.2;
        } else {
            double dirX = (isInterpolating) ? GetVelX() : m_pFleet->GetFrontX(); //Get boid front
            double dirY = (isInterpolating) ? GetVelY() : m_pFleet->GetFrontY();
            m_fAngle = atan2(dirY,dirX);
        }
        
        ctx->Save();
        ctx->Translate(m_fX, m_fY);
        
        //Draw body
        double scale = ctx->GetImageHeight(m_Ships[m_pFleet->GetSelectedSet()]) / ctx->GetImageWidth(m_Ships[m_pFleet->GetSelectedSet()]);
        double w = m_fRadius * 2.5;
        double h = w * scale;

        ctx->Rotate(m_fAngle + M_PI_2);

        if(m_pFleet->IsDashing() && !IsSplitting() && g_Game.Rendering()->GetGraphicSettings() != GameRendering::GraphicSettings::LOW)
        {
            ctx->Save();

            double width = ctx->GetImageWidth(m_ShipTrails[m_pFleet->GetSelectedSet()]);
            double height = ctx->GetImageHeight(m_ShipTrails[m_pFleet->GetSelectedSet()]);
            double scale =  height / width;
            double w = m_fRadius * 1.3;
            double h = w * scale * 2;
            double maxHeight = h;
            double minHeight = 100.0;
            double minAlpha = 0.0;
            double maxAlpha = 1.0;
            double mHeight = (maxHeight - minHeight) / ACCELERATION_END;
            double mAlpha = (maxAlpha - minAlpha) / ACCELERATION_END;

            ctx->Scale(1, -1);
            
            int32_t dashTicks = m_pFleet->GetDashTicks();
            double currentTick = MAX_DASH_TICKS - dashTicks;

            int32_t limit = std::floor(MAX_DASH_TICKS / 4);
            limit = 0;
            
            if(dashTicks > limit && dashTicks < MAX_DASH_TICKS - limit)
            {
                if (currentTick < ACCELERATION_END) {
                    mHeight = (maxHeight - minHeight) / ACCELERATION_END;
                    mAlpha = (maxAlpha - minAlpha) / ACCELERATION_END;
                    h = minHeight + mHeight * currentTick;
                    ctx->SetAlpha(minAlpha+ mAlpha * currentTick);
                } else {
                    mHeight = (minHeight - maxHeight) / (DESACCELERATION_END-ACCELERATION_END);
                    mAlpha = (minAlpha - maxAlpha) / (DESACCELERATION_END-ACCELERATION_END);
                    h = maxHeight + mHeight * (currentTick-ACCELERATION_END);
                    ctx->SetAlpha(maxAlpha + mAlpha * (currentTick-ACCELERATION_END));
                }
            
                double offset = - h + maxHeight;
                ctx->DrawImageFromAtlas(m_ShipTrails[m_pFleet->GetSelectedSet()], -0.5 * w, h * - 0.5 - height * 0.5 + offset, w, h);
            }

            ctx->Restore();

            //Trail Particles
            if(g_Game.Rendering()->GetGraphicSettings() == GameRendering::GraphicSettings::HIGH)
            {
                if(m_ParticleSystem == nullptr)
                {
                    auto particleSystem = g_Game.Cells()->GetAvailableParticleSystem();
                    m_ParticleSystem = particleSystem;
                }
                
                if(m_ParticleSystem != nullptr && dashTicks > DECREMENT_TRAIL)
                {
                    m_ParticleSystem->MakeParticleTrail(m_fAngle + M_PI + M_PI / 50, m_fAngle - M_PI + M_PI / 50, (m_fVelX * 0.00001), (m_fVelY * 0.00001), m_fRadius * 2, 15, 40, 1, m_pFleet->GetSelectedSet(), 2, m_fX, m_fY);
                }
                
                if(dashTicks == 0)
                {
                    //Clear particle system after usage
                    m_ParticleSystem->ForceReuse();
                    m_ParticleSystem = nullptr;
                }
            }
        }

        if (IsSplitting())
        {
            ctx->Save();
            ctx->SetAlpha(m_fAlpha);
            
            if (GetArmor() > 0)
            {
                ctx->DrawImageFromAtlas(m_Armours[m_pFleet->GetSelectedSet()*3+3-GetArmor()], -0.5 * w, -0.5 * h, w, h);
            }
            else
            {
                ctx->DrawImageFromAtlas(m_DeadShips[m_pFleet->GetSelectedSet()], -0.5 * w, -0.5 * h, w, h);
            }
            
            ctx->Restore();
            ctx->Save();
            ctx->SetAlpha(1-m_fAlpha);
            
            if (GetArmor() > 0)
            {
                ctx->DrawImageFromAtlas(m_Armours[m_pFleet->GetSelectedSet()*3+3-GetArmor()], -0.5 * w, -0.5 * h, w, h);
            }
            else
            {
                ctx->DrawImageFromAtlas(m_Ships[m_pFleet->GetSelectedSet()], -0.5 * w, -0.5 * h, w, h);
            }

            ctx->Restore();
        }
        else
        {
            if(m_pFleet->IsDashing() || m_pFleet->IsSpawnProtected())
            {
                ctx->SetAlpha(1-m_fAlpha);
                
                if (GetArmor() > 0)
                {
                    ctx->DrawImageFromAtlas(m_Armours[m_pFleet->GetSelectedSet()*3+3-GetArmor()], -0.5 * w, -0.5 * h, w, h);
                }
                else
                {
                    ctx->DrawImageFromAtlas(m_DashShips[m_pFleet->GetSelectedSet()], -0.5 * w, -0.5 * h, w, h);
                }
                
                ctx->SetAlpha(m_fAlpha);
                
                if (GetArmor() > 0)
                {
                    ctx->DrawImageFromAtlas(m_Armours[m_pFleet->GetSelectedSet()*3+3-GetArmor()], -0.5 * w, -0.5 * h, w, h);
                }
                else
                {
                    ctx->DrawImageFromAtlas(m_Ships[m_pFleet->GetSelectedSet()], -0.5 * w, -0.5 * h, w, h);
                }
            }
            else
            {
                if (GetArmor() > 0)
                {
                    ctx->DrawImageFromAtlas(m_Armours[m_pFleet->GetSelectedSet()*3+3-GetArmor()], -0.5 * w, -0.5 * h, w, h);
                }
                else
                {
                    ctx->DrawImageFromAtlas(m_Ships[m_pFleet->GetSelectedSet()], -0.5 * w, -0.5 * h, w, h);
                }
            }
        }
        ctx->Restore();
    }

	ctx->Restore();
}

void Cell::DrawBulletWithTrail(Context *ctx)
{
    double velocityX = ((Bullet*)this)->GetVelocityX();
    double velocityY = ((Bullet*)this)->GetVelocityY();

    double angle = atan2(velocityY, velocityX);

    ctx->Save();

    ctx->Rotate(angle + M_PI + M_PI_2);

    double width = ctx->GetImageWidth(m_LaserTrails[m_pFleet->GetSelectedSet()]) * 0.8;
    double height = ctx->GetImageHeight(m_LaserTrails[m_pFleet->GetSelectedSet()]);
    double scale =  height / width;
    double w = m_fRadius * 0.8;
    double h = w * scale;
    double maxHeight = h;

    int32_t bulletLife = ((Bullet*)this)->GetBulletLife();
    int32_t maxBulletLife = ((Bullet*)this)->GetMaxBulletLife();

    //This is used so that the trail starts with some filling, and so that the particles don't spawn in the first ticks
    double minBulletThreshold = 8.0;
    double maxBulletThreshold = maxBulletLife - minBulletThreshold;

    //Alpha
    if(bulletLife > maxBulletThreshold)
    {
        double alpha = - (1.0 / minBulletThreshold) * bulletLife + maxBulletLife / minBulletThreshold;
        ctx->SetAlpha(alpha);
    }
    else if(bulletLife >= minBulletThreshold && bulletLife <= maxBulletThreshold)
    {
        ctx->SetAlpha(1.0);
    }
    else if(bulletLife < minBulletThreshold)
    {
        double alpha = ( 1.0 / minBulletThreshold) * bulletLife;
        ctx->SetAlpha(alpha);
    }

    //Trail
    if(bulletLife >= maxBulletThreshold) bulletLife = maxBulletThreshold;

    h = (-(4 * h) / (maxBulletLife * maxBulletLife)) * ((bulletLife * bulletLife) - (maxBulletLife * bulletLife));
    if(h > maxHeight / 1.5)
    {
        h = maxHeight / 1.5;
    }
    double offset = maxHeight - h;

    //0.48 magic value
    ctx->DrawImageFromAtlas(m_LaserTrails[m_pFleet->GetSelectedSet()], -0.5 * w, h * - 0.5 - height * 0.33 + offset * 0.48, w, h);

    //Bullet Particles
    if(g_Game.Rendering()->GetGraphicSettings() == GameRendering::GraphicSettings::HIGH)
    {
        if(m_ParticleSystem == nullptr)
        {
            auto particleSystem = g_Game.Cells()->GetAvailableParticleSystem();
            m_ParticleSystem = particleSystem;
        }

        if(m_ParticleSystem != nullptr && (bulletLife < maxBulletThreshold) && (bulletLife > minBulletThreshold))
        {
            m_ParticleSystem->MakeParticleTrail(m_fAngle + M_PI + M_PI / 50, m_fAngle - M_PI + M_PI / 50, (m_fVelX * 0.00001), (m_fVelY * 0.00001), m_fRadius, 7, 100, 1, m_pFleet->GetSelectedSet(), 2, m_fX, m_fY);
        }
    }

    //Bullet Head - Should disappear first
    scale = ctx->GetImageHeight(m_Lasers[m_pFleet->GetSelectedSet()]) * 0.8 / ctx->GetImageWidth(m_Lasers[m_pFleet->GetSelectedSet()]);
    w = m_fRadius * 0.8;
    h = w * scale;

    double alpha = ctx->GetAlpha();
    if(alpha < 0.5) ctx->SetAlpha(alpha / 8);

    ctx->DrawImageFromAtlas(m_Lasers[m_pFleet->GetSelectedSet()], -0.5 * w, -h * 0.5, w, h);

    ctx->Restore();
}

void Cell::DebugDraw(Context* ctx) {
    if(m_pFleet == nullptr) return;
    // Draw boid center line
    ctx->BeginPath();
    ctx->MoveTo(m_fX, m_fY);
    ctx->LineTo(m_pFleet->GetBoidCenterX(), m_pFleet->GetBoidCenterY());
    ctx->StrokeColor(Color(255,0,0));
    ctx->SetLineWidth(1);
    ctx->Stroke();
    
    //Draw boid intent vector
    //return;
    ctx->BeginPath();
    ctx->MoveTo(m_fX, m_fY);
    ctx->LineTo(m_fX + m_pFleet->GetBoidCenterX() * 3., m_fY + m_pFleet->GetBoidCenterY() * 3.);
    ctx->SetLineWidth(1);
    ctx->StrokeColor(Color(0,255,0));
    ctx->Stroke();
}

void Cell::Update(float newX, float newY, float newVelX, float newVelY) {
    if (IsBullet()) return;
    
	if(!m_bCanReceiveUpdate) return;
	UpdatePos();
	m_fOldX = m_fX;
	m_fOldY = m_fY;

	m_fNewX = newX;
	m_fNewY = newY;
    
    m_fOldVelX = m_fVelX;
    m_fOldVelY = m_fVelY;
    
    m_fNewVelX = newVelX;
    m_fNewVelY = newVelY;
    
    if (IsFood())
        UpdatePulsingAnimation();

    m_fUpdateTime = g_Game.Now();
}

void Cell::UpdatePulsingAnimation() {
    
    if(g_Game.Rendering()->GetGraphicSettings() == GameRendering::GraphicSettings::LOW) return;
    
    float minPulse, maxPulse, pulseSpeed;
    
    minPulse = 0.8;
    maxPulse = 1.0;
    pulseSpeed = PULSE_INC_VALUE;
    
    m_bIncreasePulseValue == true ? m_fPulseValue += pulseSpeed*GetInterpolationTime() : m_fPulseValue -= pulseSpeed*GetInterpolationTime();
    
    if (m_fPulseValue < minPulse) {
        m_fPulseValue = minPulse;
        m_bIncreasePulseValue = true;
    }
    
    if (m_fPulseValue > maxPulse) {
        m_fPulseValue = maxPulse;
        m_bIncreasePulseValue = false;
    }
}

double Cell::GetInterpolationTime()
{
	return Clamp((g_Game.Now() - m_fUpdateTime) / INTERP_TIME, 0.0, 1.0);
}

void Cell::SetFleet(Fleet *fleet)
{
    if(m_pFleet != fleet)
        m_pFleet = fleet;
}

void Cell::ClearTrailParticles()
{
    if(m_ParticleSystem == nullptr) return;

    m_ParticleSystem->ClearParticles();
}

Bullet::Bullet(uint32_t id, double x, double y, double velX, double velY, double radius, int32_t bulletLife, int32_t maxBulletLife) : Cell(id, x, y, velX, velY, radius) {
    m_fX = x;
    m_fY = y;
    m_fVelocityX = velX;
    m_fVelocityY = velY;
    m_iBulletLife = bulletLife;
    m_iMaxBulletLife = maxBulletLife;
    m_fUpdateTime = g_Game.Now();
    SetIsBullet(true);
}

void Bullet::UpdatePos() {
double gameNow = g_Game.Now();
    double elapsedTime = gameNow - m_fUpdateTime;
    double posIncX = elapsedTime * (m_fVelocityX/40.0f);
    double posIncY = elapsedTime * (m_fVelocityY/40.0f);
    m_fX = m_fX + posIncX;
    m_fY = m_fY + posIncY;
    m_fUpdateTime = gameNow;
}
