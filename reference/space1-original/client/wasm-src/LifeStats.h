#ifndef LIFESTATS__H
#define LIFESTATS__H
#pragma once

class Game;
struct LifeStats {
	LifeStats(Game *g) : game(g){}
	
    //Getters
    inline int32_t GetTopPosition() { return m_iTopPosition; }
    inline int32_t GetFoodEaten() { return m_iFoodEaten; }
    inline int32_t GetBoidsKilled() { return m_iBoidsKilled; }
    inline int32_t GetPlayersKilled() { return m_iPlayersKilled; }
    inline int32_t GetMaxNumberOfBoids() { return m_iMaxNumberOfBoids; }
    inline double GetSpawnTime() { return m_fSpawnTime; }
    inline double GetDeathTime() { return m_fDeathTime; }
    inline int32_t GetHighScore() { return m_iHighScore; }
    inline int32_t GetScore() { return m_iScore; }
    inline int16_t GetCurrentPosition() { return m_iCurrentPosition; }
    inline double GetMatchDuration() { return m_fDeathTime - m_fSpawnTime; }
    
    //Setters
    inline void SetTopPosition(int32_t topPosition) { m_iTopPosition = topPosition; }
    inline void SetFoodEaten(int32_t foodEaten) { m_iFoodEaten = foodEaten; }
    inline void SetBoidsKilled(int32_t boidsKilled) { m_iBoidsKilled = boidsKilled; }
    inline void SetPlayersKilled(int32_t playersKilled) { m_iPlayersKilled = playersKilled; }
    inline void SetSpawnTime(double spawnTime) { m_fSpawnTime = spawnTime; }
    inline void SetDeathTime(double deathTime) { m_fDeathTime = deathTime; }
    inline void SetHighScore(int32_t highScore) { m_iHighScore = highScore; }
    inline void SetScore(int32_t score) { m_iScore = score; }
    inline void SetMaxNumberOfBoids(int32_t maxNumberOfBoids) { m_iMaxNumberOfBoids = maxNumberOfBoids; }
    inline void SetCurrentPosition(int16_t currentPosition) { m_iCurrentPosition = currentPosition; }

    inline void IncreaseFoodEaten() { m_iFoodEaten++; }
    inline void IncreaseBoidsKilled() { m_iBoidsKilled++; }
    inline void IncreasePlayersKilled() { m_iPlayersKilled++; }
    inline void IncreaseMaxNumberOfBoids() { m_iMaxNumberOfBoids++; }
    
    std::string GetTimeString(long int milliseconds) {
        int seconds = (int) (milliseconds / 1000) % 60 ;
        int minutes = (int) ((milliseconds / (1000*60)) % 60);
        int hours   = (int) ((milliseconds / (1000*60*60)) % 24);
        std::ostringstream time;
        hours < 10 ? time << "0" << hours << ":" : time << hours << ":";
        minutes < 10 ? time << "0" << minutes << ":" : time << minutes << ":";
        seconds < 10 ? time << "0" << seconds : time << seconds;
        return time.str();
    }
    
    // Other functions
    void Update(double dt);
    void UpdateScoreboard();
    
    // why is this in life stats. This is used in CanShoot?
    double cooldown = 0.0;
    
    // still being read in world update but not used anymore
    uint8_t foodForNextBoid = 0;
    uint8_t currentFoodForNextBoid = 0;
	
private:
    
    Game *game = nullptr;
    bool isOnScoreboard = false;
    
    double m_fSpawnTime = 0.0;
    double m_fDeathTime = 0.0;
    
    int32_t m_iTopPosition = 0;
    int32_t m_iCurrentPosition = 0;
    int32_t m_iFoodEaten = 0;
    int32_t m_iBoidsKilled = 0;
    int32_t m_iPlayersKilled = 0;
    int32_t m_iMaxNumberOfBoids = 0;
    int32_t m_iHighScore = 0;
    int32_t m_iScore = 0;
    
    
	
};

#endif
