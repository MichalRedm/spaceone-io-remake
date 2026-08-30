#ifndef GAMEMOUSE__H
#define GAMEMOUSE__H
#pragma once

#include "Screen.h"

class Game;
class GameMouse {
public:
	GameMouse(Game *game) : m_pGame(game){ RANDOM_PADDING_CTOR; }
	
	void SetMousePosition(int32_t x, int32_t y){ m_iX = x; m_iY = y; }
	double GameX();
	double GameY();
    double MousePosDistanceToCenterX();
    double MousePosDistanceToCenterY();
	
private:
	RANDOM_PADDING(2);
	
	Game *m_pGame;
	int32_t m_iX = 0;
	int32_t m_iY = 0;
	
};

#endif