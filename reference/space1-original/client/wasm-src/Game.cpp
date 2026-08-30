#include "stdafx.h"
#include "Game.h"
#include "Screen.h"

Game g_Game;

void Game::Reset(){
	if(g_Game.Networking()->HasConnection()){
		g_Game.~Game();
		new (&g_Game) Game();
	}
}

void Game::Render(Context *ctx){
	UpdateNow();
	double dt = Now() - m_fLastTick;
	m_fLastTick = Now();
	
#ifdef DEBUG
	double start = emscripten_get_now();
#endif
	
	m_Networking.Think();
	m_Rendering.Render(ctx);
	m_Cells.Think();
	m_LifeStats.Update(dt);
	
#ifdef DEBUG
	double end = emscripten_get_now();
	m_Rendering.FinishedFrame(ctx, end - start);
#endif
	
	
}

void Game::OnPlayerSpawn(){
	ResetLifeStats();
    ResetArenaClosingInfo();
	Stats()->SetSpawnTime(Now());
	m_bIsPlayerAlive = true;
	js_notify_player_spawn();
#ifdef EMSCRIPTEN
    EM_ASM_({ IO.RightMouseClickEnabled($0) }, false);
#endif
}

void Game::OnDisconnect(bool forcedDisconnect, bool isReconnection)
{
	Debug("Game Disconnect was called");
	Rendering()->SetSlowFadeout();
	Rendering()->GetAnnouncementsManager()->ClearAll();

	m_bIsPlayerAlive = false;

	js_notify_disconnected(forcedDisconnect, false, isReconnection);
}

void Game::OnPlayerDeath(){
    UpdateHighScore(Stats()->GetScore());
	Rendering()->SetSlowFadeout();
    Rendering()->GetAnnouncementsManager()->ClearAll();
	Stats()->SetDeathTime(Now());
	m_bIsPlayerAlive = false;
	
	js_notify_player_death();
}

void Game::OnCellEaten(Cell *attacker, Cell *victim){
    Debug("On cell eaten");
	if(Cells()->IsMine(attacker) && !Cells()->IsMine(victim)){
		if(victim->IsFood()){
            Stats()->IncreaseFoodEaten();
		}else if (victim->IsValidBoid()){
            Stats()->IncreaseBoidsKilled();
		}
	}
}

