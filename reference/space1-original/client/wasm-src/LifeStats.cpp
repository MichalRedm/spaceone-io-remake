#include "stdafx.h"
#include "LifeStats.h"
#include "Game.h"

namespace {
	//Context *s_GraphCtx = Context::FromCanvas("statsGraph");
};

void LifeStats::Update(double dt){
	if(game->Networking()->IsSpectating() || game->Cells()->GetMyCells().empty()) return;
}

void LifeStats::UpdateScoreboard(){
	isOnScoreboard = false;
	
	int i = 0;
	for(auto &entry : game->Networking()->GetScoreboard()){
		++i;
		
		if(entry.isMe){
			m_iCurrentPosition = i;
			break;
		}
	}
	
	if(m_iCurrentPosition){
		isOnScoreboard = true;
		
		if(m_iTopPosition == 0){
			m_iTopPosition = m_iCurrentPosition;
		}else{
			m_iTopPosition = std::min(m_iTopPosition, m_iCurrentPosition);
		}
	}
}

