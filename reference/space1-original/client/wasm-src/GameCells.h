#ifndef GAMECELLS__H
#define GAMECELLS__H
#pragma once

#define MAX_PARTICLE_SYSTEMS 2000

#include "Cell.h"
#include "ParticleSystem.h"

class Game;
class GameCells {
public:
	//Constructors
	GameCells(){ BootstrapParticleSystems(MAX_PARTICLE_SYSTEMS); }
	~GameCells(){}
	
	//Getters
		//Inline
		inline Cell* ByID(uint32_t id)
		{
			auto it = m_CellsByID.find(id);
			if(it == m_CellsByID.end()) return nullptr;
			return it->second;
		}
		inline Fleet* GetFleetByID(uint32_t id)
		{
			auto it = m_FleetsByID.find(id);
			if(it == m_FleetsByID.end()) return nullptr;
			return it->second;
		}

		inline const std::vector<Cell*>& GetMyCells(){ return m_MyCells; }
		inline Fleet* GetMyFleet(){ return m_MyFleet; }
		inline size_t GetFleetNumber() { return m_FleetsByID.size(); }

		//Non-Inline

	//Setters

	//Other Inline funcs
	inline void ClearMyCells() { m_MyCells.clear(); m_MyCellsIDs.clear(); }
	inline void RegisterCell(Cell *cell) { m_Cells.push_back(cell);	m_CellsByID[cell->GetID()] = cell; }
	inline void EverySecond(){ Think(); }
	inline void DestroyCell(Cell *cell, bool isMine)
	{
		if(isMine)
		{
			RemoveMyCell(cell);
		}

		EraseCell(cell);
		delete cell;
	}
	template<typename F>
	inline void ForEach(const F &function)
	{
		for(Cell *cell : m_Cells) function(cell);
	}
	template<typename F>
	inline void ForEachNonBoid(const F &function)
	{
		for(Cell *cell : m_Cells)
		{
			if(!cell->IsFood()) continue;
			function(cell);
		}
	}
	template<typename F>
	inline void ForEachFleet(const F &function)
	{
		for(auto fleetIterator : m_FleetsByID)
		{
			if(fleetIterator.second->IsDestroyed()) continue;
			function(fleetIterator.second);
		}
	}
	template<typename F>
    inline void ForEachBullet(const F &f) {
        for(Cell *c : m_Cells)
            if (c->IsBullet()) f(c);
    }
	template<typename F>
    inline void ForEachParticleSystem(const F &function) {
        for(auto particleSystem : m_UnavailableParticleSystems)
		{
			if(particleSystem == nullptr) continue;
			function(particleSystem);
		}
    }
	inline bool IsMine(uint32_t id){ return std::find(m_MyCellsIDs.begin(), m_MyCellsIDs.end(), id) != m_MyCellsIDs.end(); }
	inline bool PlayerHasFleet() { return m_MyFleet != nullptr; }
	inline bool IsMine(Cell *cell){ return std::find(m_MyCells.begin(), m_MyCells.end(), cell) != m_MyCells.end(); }
	inline bool PlayerHasCells(){ return !m_MyCells.empty(); }
    inline bool PlayerHasBoids()
	{
        for (auto it : m_MyCells)
            if (!it->IsFood() && !it->IsBullet()) return true;
			
        return false;
    }
	inline void AddMyCellID(uint32_t id){ m_MyCellsIDs.push_back(id); }
	inline void AddMyCell(Cell *c){	m_MyCells.push_back(c);	}
	inline void RegisterMyFleet(Fleet* fleet) { m_MyFleet = fleet; m_FleetsByID.insert({fleet->GetID(), fleet}); }
	inline void RegisterFleet(Fleet *fleet) { m_FleetsByID.insert({fleet->GetID(), fleet}); }

	//Other Non-Inline funcs
	void Think();
	void PurgeCells();
	void ResetCells(bool resetParticles);
	void OnIdle();
	void RemoveMyCell(Cell *cell);
	void RemoveFleet(Fleet *fleet);
	std::shared_ptr<ParticleSystem> GetAvailableParticleSystem();
	void BootstrapParticleSystems(uint32_t maxNumParticleSystems);
	
private:
	// Erase cell from all vectors, but you need to either free it or add it back to another vector after calling this
	void EraseCell(Cell *c);
	
	//bool m_bPurgePending = true;
	std::vector<uint32_t> m_MyCellsIDs;
	std::vector<Cell*> m_MyCells;
	std::vector<Cell*> m_Cells;
	std::unordered_map<uint32_t, Cell*> m_CellsByID;

	std::unordered_map<uint32_t, Fleet*> m_FleetsByID;
	Fleet* m_MyFleet = nullptr;

	std::vector<std::shared_ptr<ParticleSystem>> m_AvailableParticleSystems;
	std::vector<std::shared_ptr<ParticleSystem>> m_UnavailableParticleSystems;
};

#endif