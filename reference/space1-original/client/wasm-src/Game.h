#ifndef GAME__H
#define GAME__H
#pragma once

#include "GameNetworking.h"
#include "GameRendering.h"
#include "GameCells.h"
#include "GameMouse.h"
#include "GameConfiguration.h"
#include "LifeStats.h"

#ifndef EMSCRIPTEN
#include <sys/time.h>
static double emscripten_get_now(){
    struct timeval tp;
    gettimeofday(&tp, NULL);
    return tp.tv_sec * 1000.0 + tp.tv_usec / 1000.0;
}
#endif

class Game {
public:
	//Constructors
	Game() : m_Networking(this), m_Rendering(this), m_Mouse(this),  m_LifeStats(this), m_fStart(emscripten_get_now()) {	UpdateNow(); m_fLastTick = Now(); }

	//Getters
	inline GameNetworking *Networking(){ return &m_Networking; }
	inline GameRendering *Rendering(){ return &m_Rendering; }
	inline GameCells *Cells(){ return &m_Cells; }
	inline GameMouse *Mouse(){ return &m_Mouse; }
	inline GameConfiguration *Configuration(){ return &m_Configuration; }
	inline LifeStats *Stats(){ return &m_LifeStats; }
	inline double Now(){ return m_fNow; }
	inline double GetStartTime(){ return m_fStart; }
	inline bool IsPlayerAlive(){ return m_bIsPlayerAlive; }
	inline uint16_t NumberOfValidBoids() { return m_iTotalValidBoids; }
	inline bool IsArenaClosing() { return m_bArenaIsClosing; }

	//Setters
	inline void UpdateNow(){ m_fNow = emscripten_get_now(); }
	inline void SetNumberOfValidBoids(uint16_t number) { m_iTotalValidBoids = number; }
	inline void CloseArena() { m_bArenaIsClosing = true; }

	//Other Inline funcs
	inline void UpdateHighScore(int score) 
	{
        if (score > Stats()->GetHighScore()) {
            Stats()->SetHighScore(score);
#ifdef EMSCRIPTEN
            EM_ASM_({ IO.setHighScore($0) }, Stats()->GetHighScore());
#endif
        }
    }
	inline void ResetLifeStats(){ m_LifeStats.~LifeStats(); new (&m_LifeStats) LifeStats(this); }
    inline void ResetArenaClosingInfo() { m_bArenaIsClosing = false; m_Rendering.ResetBackgroundAlpha(); }
    
	//Other Non-Inline funcs
	static void Reset();
	void Render(Context *ctx);
	void OnPlayerSpawn();
	void OnPlayerDeath();
	void OnDisconnect(bool forcedDisconnect, bool isReconnection);
	void OnCellEaten(Cell *attacker, Cell *victim);
    
private:
	GameNetworking m_Networking;
	GameRendering m_Rendering;
	GameCells m_Cells;
	GameMouse m_Mouse;
	GameConfiguration m_Configuration;
	
	LifeStats m_LifeStats;
	
	double m_fStart = 0.0;
	double m_fNow = 0.0;
	double m_fLastTick;
    uint16_t m_iTotalValidBoids = 0;

	bool m_bIsPlayerAlive = false;
	bool m_bArenaIsClosing = false;
};

extern Game g_Game;

#endif
