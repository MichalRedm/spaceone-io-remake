#include "stdafx.h"
#include "GameCells.h"
#include "Game.h"

void GameCells::Think()
{
	if(m_AvailableParticleSystems.size() == MAX_PARTICLE_SYSTEMS) return;

	for (auto it = m_UnavailableParticleSystems.begin(); it != m_UnavailableParticleSystems.end();)
	{
		(*it)->Update();
		
        if ((*it)->HasBeenUsed())
        {
			(*it)->Reset();
            m_AvailableParticleSystems.push_back((*it));
            it = m_UnavailableParticleSystems.erase(it);
        }
        else
        {
            it++;
        }
	}

	// Debug("---------------------");
	// if(m_UnavailableParticleSystems.size() > 0) Debug("Unavailable: %u", m_UnavailableParticleSystems.size());
	// if(m_AvailableParticleSystems.size() > 0) Debug("Available: %u", m_AvailableParticleSystems.size());
	// Debug("---------------------");
}

void GameCells::OnIdle(){
	//if(m_bPurgePending) PurgeCells();
}

void GameCells::ResetCells(bool resetParticles){
	for(Cell *c : m_Cells) delete c;
	m_Cells.clear();
	m_CellsByID.clear();
	m_MyCells.clear();
	m_MyCellsIDs.clear();

	if(resetParticles)
	{
		m_UnavailableParticleSystems.clear();
		m_AvailableParticleSystems.clear();
	}

	for(auto fleetIterator : m_FleetsByID) delete fleetIterator.second;
	m_FleetsByID.clear();	
}

void GameCells::EraseCell(Cell *c){
    if (c == nullptr) {
        return;
    }
    
	auto it = std::find(m_Cells.begin(), m_Cells.end(), c);
	if(it != m_Cells.end()){
		std::swap(*it, m_Cells.back());
		m_Cells.pop_back();
	}
	
	auto kt = m_CellsByID.find(c->GetID());
	if(kt != m_CellsByID.end() && kt->second == c){
		m_CellsByID.erase(kt);
	}
	
	if(IsMine(c)){
		m_MyCells.erase(std::find(m_MyCells.begin(), m_MyCells.end(), c));
		m_MyCellsIDs.erase(std::find(m_MyCellsIDs.begin(), m_MyCellsIDs.end(), c->GetID()));
	}
}

void GameCells::RemoveMyCell(Cell *cell)
{
	{
		auto it = std::find(m_MyCellsIDs.begin(), m_MyCellsIDs.end(), cell->GetID());
		if(it != m_MyCellsIDs.end()){
			m_MyCellsIDs.erase(it);
		}
	}
	
	{
		auto it = std::find(m_MyCells.begin(), m_MyCells.end(), cell);
		if(it != m_MyCells.end()){
			m_MyCells.erase(it);
		}
	}
}

void GameCells::RemoveFleet(Fleet *fleet)
{
	if(fleet == nullptr) return; 

	m_FleetsByID.erase(fleet->GetID());

	if(m_MyFleet == fleet)
	{
		m_MyFleet->ClearAllCells();
		m_MyFleet = nullptr;
	}
	else
	{
		fleet->ClearAllCells();
	}

	delete fleet;
}

std::shared_ptr<ParticleSystem> GameCells::GetAvailableParticleSystem()
{
	auto numAvailablePSystems = m_AvailableParticleSystems.size();

    if(numAvailablePSystems > 0)
    {
        auto pSystem = m_AvailableParticleSystems.back();
        m_UnavailableParticleSystems.push_back(pSystem);
        m_AvailableParticleSystems.pop_back();
        return pSystem;
    }
    else
    {
        Debug("No available particle SYSTEMS");
        return nullptr;
    }
}

void GameCells::BootstrapParticleSystems(uint32_t maxNumParticleSystems)
{
	for(uint32_t i = 0; i < maxNumParticleSystems; i++)
	{
		m_AvailableParticleSystems.push_back(std::make_shared<ParticleSystem>());
	}
}
