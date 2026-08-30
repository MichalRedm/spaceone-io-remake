#ifndef CELL__H
#define CELL__H
#pragma once

#include "Fleet.h"

#define DECREMENT_TRAIL 5
#define MAX_DASH_TICKS 25

class Game;
class ParticleSystem;
class Cell {
public:

	//Constructors
	Cell(uint32_t id, float x, float y, float velX, float velY, float radius) : m_iID(id), m_fX(x), m_fY(y), m_fVelX(velX), m_fVelY(velY), m_fRadius(radius)
	{
        m_fOldX = x;
        m_fOldY = y;
        m_fNewX = x;
        m_fNewY = y;
        m_fOldVelX = velX;
        m_fOldVelY = velY;
        m_fNewVelX = velX;
        m_fNewVelY = velY;
        double sign = cp5::random() - 0.5f;
    	sign < 0 ? sign = -1 : sign = 1;
	    m_fFoodRotRndInc = sign * (0.005 + cp5::random()*0.015f);
	}

    Cell(float x, float y, float velX, float velY) : m_fX(x), m_fY(y), m_fVelX(velX), m_fVelY(velY) {};

	//Getters
		//Inline
	inline bool IsBullet() const { return m_bIsBullet; }
    inline bool IsValidBoid() const { return !m_bIsFood && !m_bIsBullet && !m_bIsSplitting; }
    inline bool IsBoid() const { return !m_bIsFood && !m_bIsBullet; }
	inline bool IsFood() const { return m_bIsFood; }
    inline bool IsSplitting() { return m_bIsSplitting; }
	inline float GetX() const { return m_fX; }
    inline float GetY() const { return m_fY; }
    inline float GetVelX() const { return m_fVelX; }
    inline float GetVelY() const { return m_fVelY; }
	inline int GetUIMass() const { return floor(m_fRadius * m_fRadius / 100); }
	inline int GetScoreMass() const { return floor(m_fRadius * m_fRadius / 100); }
	inline Fleet* GetFleet() { return m_pFleet; }
	inline uint32_t GetID() const { return m_iID; }
	inline float GetRadius() const { return m_fRadius; }
    inline float GetAlpha() const { return m_fAlpha; }
    inline int8_t GetArmor() { return m_iArmor; }
	inline bool IsBeingDestroyed() const { return m_bDestroyed; }
	inline bool IsInDecay() { return m_iDecayTick > 0; }
    inline bool ShouldExplode() { return m_bShouldExplode; }
    inline double GetTrailVelocityX() { return m_fTrailVelocityX; }
    inline double GetTrailVelocityY() { return m_fTrailVelocityY; }
    inline int GetFoodIndex() { return m_iFoodIndex; }
    inline std::shared_ptr<ParticleSystem> GetParticleSystem() { return m_ParticleSystem; }
		//Non-Inline
	double GetInterpolationTime();
	static uint32_t GetTotalCellsAllocated();
	static uint32_t GetTotalCellsInUse();

	//Setters
		//Inline
    inline void SetVelocity(double velocityX, double velocityY) { m_fVelX = velocityX; m_fVelY = velocityY; }
	inline void SetIsBullet(bool v){ m_bIsBullet = v; }
    inline void SetIsFood(bool v){ m_bIsFood = v; }
    inline void SetDecay(int16_t tick, int16_t total){ m_iDecayTick = tick; m_iDecayTotalTick = total; }
    inline void SetSplitting(bool isSplitting) { m_bIsSplitting = isSplitting; }
    inline void SetAlpha(float alpha) { m_fAlpha = alpha; }
    inline void SetArmor(int8_t armor) { m_iArmor = armor; }
    inline void SetShouldExplode(bool shouldExplode) { m_bShouldExplode = shouldExplode; }
    inline void IncreaseTrailVelocity(double trailVelocityX, double trailVelocityY) { m_fTrailVelocityX += trailVelocityX; m_fTrailVelocityY += trailVelocityY; }
		//Non-Inline
	void SetFleet(Fleet * fleet);

	//Other Inline funcs
	inline void BlockFurtherUpdates(){ m_bCanReceiveUpdate = false; }

	//Other Non-Inline funcs
	void UpdatePos();
	void Destroy(bool isMine);
	void Update(float newX, float newY, float newVelX, float newVelY);
    void UpdatePulsingAnimation();
	bool IsOnScreen();
	double CalcVelocityNorm();
	void Render(Context *ctx);
	void DebugDraw(Context* ctx);
    void ClearTrailParticles();
    
protected:
	uint32_t m_iID;
	
    Fleet *m_pFleet = nullptr;

    void DrawBulletWithTrail(Context *ctx);    
    
	float m_fX;
    float m_fY;
	float m_fOldX;
	float m_fOldY;
	float m_fNewX;
	float m_fNewY;
    float m_fOldVelX = 0.0f;
    float m_fOldVelY = 0.0f;
    float m_fVelX = 0.0f;
    float m_fVelY = 0.0f;
    float m_fNewVelX = 0.0f;
    float m_fNewVelY = 0.0f;
    float m_fRadius = 0.0;
    float m_fFoodRot = 0;
    float m_fFoodRotRndInc = 0;
    float m_fAlpha = 0.0;
    double m_fDrawTime = 0.0;
	double m_fUpdateTime = 0.0;
    double m_fAngle = 0.0;
	int m_iDrawCount = 0;
    double m_fTrailX = 0.0;
    double m_fTrailY = 0.0;
    double m_fTrailVelocityX = 0.0;
    double m_fTrailVelocityY = 0.0;
    int m_iFoodIndex = 0;
    Color m_Color;
    
    int16_t m_iDecayTick = 0;
    int16_t m_iDecayTotalTick = 0;
    int8_t m_iArmor = 0;
    
    bool m_bDestroyed = false;
    bool m_bCanReceiveUpdate = true;
	bool m_bIsBullet = false;
    bool m_bIsSpawnProtected = false;
	bool m_bIsFood = false;
	bool m_bSpawnProtectionDraw = true;
    bool m_bIsSplitting = false;
    bool m_bShouldExplode = false;

    //PIXI TEST
    //bool m_bHasDrawnBullet = false;
    //int m_iRectID = 0;
    
    bool m_bIncreasePulseValue = false;
    float m_fPulseValue = 0.9;
    std::shared_ptr<ParticleSystem> m_ParticleSystem = nullptr;
};

class Bullet : public Cell {
    
public:
    Bullet(uint32_t id, double x, double y, double velX, double velY, double radius, int32_t bulletLife, int32_t maxBulletLife);
    
    inline double GetVelocityX() { return m_fVelocityX; }
    inline double GetVelocityY() { return m_fVelocityY; }
    inline int32_t GetBulletLife() { return m_iBulletLife; }
    inline int32_t GetMaxBulletLife() { return m_iMaxBulletLife; }
    
    inline void SetVelocity(double velocityX, double velocityY) { m_fVelocityX = velocityX; m_fVelocityY = velocityY; }
    inline void DecrementBulletLife() { if(m_iBulletLife > 0) m_iBulletLife--; }
    
    void UpdatePos();
    
private:
    double m_fVelocityX = 0.0;
    double m_fVelocityY = 0.0;
    int32_t m_iBulletLife = 0;
    int32_t m_iMaxBulletLife = 0;
};

#endif
