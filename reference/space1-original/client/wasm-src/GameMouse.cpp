#include "stdafx.h"
#include "GameMouse.h"
#include "Game.h"

double GameMouse::GameX(){
	return (m_iX - g_Screen.width / 2) / m_pGame->Rendering()->GetZoom() + m_pGame->Rendering()->GetCameraX();
}

double GameMouse::GameY(){
	return (m_iY - g_Screen.height / 2) / m_pGame->Rendering()->GetZoom() + m_pGame->Rendering()->GetCameraY();
}

double GameMouse::MousePosDistanceToCenterX() {
    return (m_iX - g_Screen.width / 2);
}

double GameMouse::MousePosDistanceToCenterY() {
    return (m_iY - g_Screen.height / 2);
}