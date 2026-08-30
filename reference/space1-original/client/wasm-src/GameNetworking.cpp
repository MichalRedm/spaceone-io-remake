#include "stdafx.h"
#include "GameNetworking.h"
#include "Game.h"
#include "AnnouncementType.h"
#include "Announcement.h"
#include "Fleet.h"
#include "Particle.h"
#include <chrono>
#include <iostream>

#define UPDATE_TIME 40
#define EXPLOSION_VELOCITY 1.8

GameNetworking::GameNetworking(Game *game) : m_pGame(game), m_pMaestroHandler(this)
{
	m_PacketProcessors[S2C_ARENA_STATE] = [&](BinView &view)
	{
		bool shouldRenderLeader = view.NextUint8();
		if(shouldRenderLeader)
		{
			m_pGame->Rendering()->SetLeaderCoordinates(view.NextFloat(), view.NextFloat());
		}

		m_pGame->Rendering()->SetShouldRenderLeader(shouldRenderLeader);

		WorldUpdate(view);
	};

    m_PacketProcessors[S2C_IN_POINTS] = [&](BinView &view){
//        int pointsGain = view.NextInt32();
//        int boidID = view.NextInt32();
//        std::string message = "+" + std::to_string(pointsGain);
//        if (m_pGame->Rendering()->GetGraphicSettings() == GameRendering::GraphicSettings::HIGH) {
//            Announcement* announcement = m_pGame->Rendering()->GetAnnouncementsManager()->Create(message, AnnouncementType::POINTS_GAIN, true, 100);
//            announcement->FollowBoid(boidID);
//        }
    };

	// Spectator update
	m_PacketProcessors[S2C_SPECTATING_PARAMS] = [&](BinView &view){
		Camera c;
		c.x = view.NextFloat();
		c.y = view.NextFloat();
		c.zoom = view.NextFloat();
		m_pGame->Rendering()->SetSpectatorCamera(c);
	};
	
	m_PacketProcessors[S2C_PURGE_CLIENT_CACHED_CELLS] = [&](BinView &view){
		m_pGame->Cells()->ResetCells(false);
		//Maybe Reset fleets
	};
	
	m_PacketProcessors[0x14] = [&](BinView &view){
		m_pGame->Cells()->ClearMyCells();
		//Maybe Clear fleets
	};
	
	m_PacketProcessors[S2C_CELL_ADDED] = [&](BinView &view){
		m_pGame->Cells()->AddMyCellID(view.NextUint32());
	};

	m_PacketProcessors[S2C_IN_ANNOUNCEMENT] = [&](BinView &view){
        std::string cellName = view.NextUTF8String();
		if(cellName.empty()) cellName = "an unknown fleet";
        int pointsGain = view.NextInt32();
        std::string message = "You killed " + cellName + "!";
        m_pGame->Rendering()->GetAnnouncementsManager()->Create(message, AnnouncementType::MESSAGE, true);
        m_pGame->Stats()->IncreasePlayersKilled();
        message = "+" + std::to_string(pointsGain);
        m_pGame->Rendering()->GetAnnouncementsManager()->Create(message, AnnouncementType::POINTS_GAIN, true, 60);
	};
	
	m_PacketProcessors[S2C_SCOREBOARD] = [&](BinView &view){		
		int len = view.NextUint32();
		
		m_Scoreboard.clear();
		for(int i = 0; i < len; ++i){
			bool isMe = view.NextUint8();
			m_Scoreboard.push_back(ScoreboardEntry{isMe, view.NextUTF8String(), view.NextUint32(), Color{view.NextUint8(), view.NextUint8(), view.NextUint8()}});
		}

		g_Game.Rendering()->SetArenaHighscorer(view.NextUTF8String(), view.NextUint32());

		m_pGame->Stats()->UpdateScoreboard();
		m_pGame->Rendering()->UpdateScoreboard();
	};
	
	m_PacketProcessors[S2C_TEAMS_SCOREBOARD] = [&](BinView &view){
		int len = view.NextUint32();
		
		m_TeamScoreboard.clear();
		for(int i = 0; i < len; ++i){
			m_TeamScoreboard.push_back(view.NextFloat());
		}
		
		m_pGame->Stats()->UpdateScoreboard();
		m_pGame->Rendering()->UpdateScoreboard();
	};
	
	// Map init
	m_PacketProcessors[S2C_FIRST_MAP_BORDERS] = [&](BinView &view){
		double minX = view.NextDouble();
		double minY = view.NextDouble();
		double maxX = view.NextDouble();
		double maxY = view.NextDouble();
		
		if(minX > maxX) std::swap(minX, maxX);
		if(minY > maxY) std::swap(minY, maxY);

		m_pGame->Rendering()->UpdateMapDimensions(minX, minY, maxX, maxY);
		
		if(!m_bHasInitialMapBorders){
			m_bHasInitialMapBorders = true;

			Camera c;
			c.x = (minX + maxX) / 2;
			c.y = (minY + maxY) / 2;
			c.zoom = 1.0;
			m_pGame->Rendering()->SetSpectatorCamera(c);

			if(!m_pGame->Cells()->PlayerHasCells()){
				m_pGame->Rendering()->SetCamera(c);
			}
		}
        
        double deadZoneMinX = view.NextDouble();
        double deadZoneMinY = view.NextDouble();
        double deadZoneMaxX = view.NextDouble();
        double deadZoneMaxY = view.NextDouble();
        
        if(deadZoneMinX > deadZoneMaxX) std::swap(deadZoneMinX, deadZoneMaxX);
        if(deadZoneMinY > deadZoneMaxX) std::swap(deadZoneMinY, deadZoneMaxX);
        
        m_pGame->Rendering()->UpdateDeadZoneMapDimensions(deadZoneMinX, deadZoneMinY, deadZoneMaxX, deadZoneMaxY);		
	};

	m_PacketProcessors[S2C_IN_PONG] = [&](BinView &view){
		m_PongMessageTime = std::chrono::high_resolution_clock::now();

		//This is actually the RTT
		double latency = std::chrono::duration_cast<std::chrono::milliseconds>(m_PongMessageTime - m_PingMessageTime).count();

		if(m_iCurrentLatencyArrayIndex >= m_Latency.size())
		{
			m_iCurrentLatencyArrayIndex = 0;
		}

		m_fAverageLatency = CalculateAverageValueFromArray(m_Latency, latency / 2, m_iCurrentLatencyArrayIndex++);
	};

	m_PacketProcessors[S2C_ARENA_CLOSING] = [&](BinView &view){
		Debug("---------------- Got Arena Closing message! ------------------");
		m_pGame->Rendering()->GetAnnouncementsManager()->Create("ARENA CLOSING SOON", AnnouncementType::ARENA_CLOSING);
		m_pGame->CloseArena();
		Debug("\n");
	};

	m_PacketProcessors[S2C_IN_EVENT] = [&](BinView &view){
//		std::string eventMessage = view.NextUTF8String();
//		auto announcementManager = m_pGame->Rendering()->GetAnnouncementsManager();
//
//		uint32_t numEventAnnouncements = announcementManager->GetNumAnnouncementsForType(AnnouncementType::EVENT);
//
//		announcementManager->Create(eventMessage, AnnouncementType::EVENT, true, 100 / numEventAnnouncements);
	};
}

void GameNetworking::Think(){
	CleanLogs();
	
	// Update target every x ms
	//if((m_bHasSolvedFirstChallenge || !g_Settings.integrityChecks) && m_pGame->Now() - m_fLastTargetUpdate > 15.0){
	if(m_pGame->Now() - m_fLastTargetUpdate > 45.0){
		m_fLastTargetUpdate = m_pGame->Now();
		
		if(m_bSentNick && m_pGame->IsPlayerAlive())
		{
			ForceSendMousePosition();
		}
	}
}

void GameNetworking::EverySecond()
{
	//Send Ping to server to measure latency
	BinData out;
	out.PushUint8(OUT_PING);
	Write(out);

	m_PingMessageTime = std::chrono::high_resolution_clock::now();
}

void GameNetworking::WorldUpdate(BinView &view){
	CalculateUpdateTime();

	m_pGame->UpdateNow();
	
	if(!m_bSentNick && m_bWantsToPlay){
		ConnectionFailsafe();
	}
    
	bool justLostMyCell = false;
    
    std::string version = view.NextUTF8String();
    bool drawStarfield = view.NextUint8() == 1;
    bool isInterpolating = view.NextUint8() == 1;
    
    uint16_t numberOfValidBoids = view.NextUint16();
    
    m_pGame->Configuration()->SetConfigVersion(version);
    m_pGame->Configuration()->SetDrawStarfieldEnabled(drawStarfield);
    m_pGame->Configuration()->SetInterpolatingEnabled(isInterpolating);
    m_pGame->SetNumberOfValidBoids(numberOfValidBoids);
    
    // Player general info
    bool isDangerZone = view.NextUint8() == 1;
    
    double cooldownPerc = std::max<double>(view.NextDouble(), 0.0f);
    cooldownPerc = std::min<double>(cooldownPerc, 1.0f);
    m_pGame->Stats()->cooldown = cooldownPerc;
    
    m_pGame->Stats()->currentFoodForNextBoid = view.NextUint8();
    m_pGame->Stats()->foodForNextBoid = view.NextUint8();

//	g_Game.Rendering()->SetCurrentKillStreak(view.NextUint32());

	//----------------------------------------------------------
    
    if (isDangerZone && !m_bIsDangerZone && !m_pGame->IsArenaClosing()) {
        m_dangerAnnouncement = m_pGame->Rendering()->GetAnnouncementsManager()->Create("DANGER! RETURN TO BATTLE", AnnouncementType::DANGER);
        m_bIsDangerZone = true;
    } else if (!isDangerZone && m_bIsDangerZone) {
        if (m_dangerAnnouncement)
            m_dangerAnnouncement->m_bIsToRemove = true;
        m_bIsDangerZone = false;
    }
    
	//Fleets info
	uint32_t numFleets = view.NextUint32();
	//Debug("Going to decode %u fleets", numFleets);
	for(int i = 0; i < numFleets; i++)
	{
        uint32_t fleetSize = view.NextUint32();
        if (fleetSize == 0) continue;
        
        Fleet* fleet = HandleFleetDecoding(view);
        
		//All cells info
		for(int j = 0; j < fleetSize; j++)
		{
			justLostMyCell = HandleCellDecoding(view, fleet);
		}
	}

	//Get food
	int numOtherCells = view.NextUint32();
	for(int k = 0; k < numOtherCells; k++)
	{
		HandleCellDecoding(view, nullptr);
	}
    
	//Deleted Cells
	int numDeleted = view.NextUint16();
	for(int l = 0; l < numDeleted; l++)
	{
		HandleDeletedCellsDecoding(view, justLostMyCell);
	}

    UpdateBulletsPosition();
    UpdateMaxNumberOfBoidsStat();
}

void GameNetworking::UpdateMaxNumberOfBoidsStat() {
    int size = 0;
    for(auto v : g_Game.Cells()->GetMyCells()){
        if (v->IsValidBoid()) size++;
    }
    if (size > m_pGame->Stats()->GetMaxNumberOfBoids())
        m_pGame->Stats()->SetMaxNumberOfBoids(size);
}

void GameNetworking::UpdateBulletsPosition()
{
    m_pGame->Cells()->ForEachBullet([&](Cell *c)
	{
        Bullet* bullet = (Bullet*) c;
        bullet->UpdatePos();
        bullet->DecrementBulletLife();
		
    });
}

Fleet* GameNetworking::HandleFleetDecoding(BinView &view)
{
	uint32_t id = view.NextUint32();
	//Debug("Decoding fleet with ID: %u", id);

    uint16_t fleetSizeOnServer = view.NextUint16();
    
	// Boid central position
	int32_t bcx = view.NextInt32();
	int32_t bcy = view.NextInt32();
	
	// Boid front Position
	double dbfx = view.NextDouble();
	double dbfy = view.NextDouble();

	//Boid front T Position
	int32_t bftx = view.NextInt32();
	int32_t bfty = view.NextInt32();
    
    int32_t foodsEaten = view.NextInt32();
    int32_t boidsDestroyed = view.NextInt32();

	uint16_t flags = view.NextUint16();
	bool isSpawnProtected = view.NextUint8();

	bool hasColor = flags & 1;
	bool hasName = flags & 2;
	bool isDashing = flags & 4;

	Color color{0xFF, 0xFF, 0xFF};
	
	if(hasColor){
		color.r = view.NextUint8();
		color.g = view.NextUint8();
		color.b = view.NextUint8();
	}

	uint8_t selectedSet = view.NextUint8();

	int32_t dashTicks = 0;
	if(isDashing) dashTicks = view.NextInt32();

	std::string name;
	if(hasName)
	{
		name = view.NextUTF8String();
	}

	int32_t leaderboardPosition = view.NextUint32();
	int32_t score = view.NextUint32();

	bool isMyFleet = view.NextUint8();

	//--------------FINISHED RECEIVING DATA ---------------//

	Fleet *fleet = g_Game.Cells()->GetFleetByID(id);

	if(fleet == nullptr)
	{
		Debug("Created a new Fleet with ID: %u and name: %s", id, name.c_str());
		fleet = new Fleet(id, bcx, bcy, color);
		//I haven't registered this fleet yet
		if(isMyFleet)
		{
			g_Game.Cells()->RegisterMyFleet(fleet);
		}
		else
		{
			g_Game.Cells()->RegisterFleet(fleet);
		}
	}
	else
	{
		fleet->Update(bcx, bcy);
        g_Game.Stats()->SetFoodEaten(foodsEaten);
        g_Game.Stats()->SetBoidsKilled(boidsDestroyed);
	}

	fleet->SetIsSpawnProtected(isSpawnProtected);
	fleet->SetLeaderboardPosition(leaderboardPosition);
	fleet->SetScore(score);
	fleet->SetFleetFrontPosition(dbfx, dbfy);
    fleet->SetFleetSizeOnServer(fleetSizeOnServer);
	fleet->SetIsDashing(isDashing);
	if(isDashing) fleet->SetDashTicks(dashTicks);

	if(isMyFleet)
	{
		//Debug("Setting fleet transversal position to: %f, %f -----------------", bftx, bfty);
		fleet->SetFleetFrontTransversalPosition(bftx, bfty);
	}

    fleet->SetSelectedSet(selectedSet);
	
	if(!name.empty())
	{
		fleet->SetName(name);
		if(isMyFleet)
		{
			m_pGame->Rendering()->SetMyFleetName(name);
		}
	}

	return fleet;
}

bool GameNetworking::HandleCellDecoding(BinView &view, Fleet *fleet)
{
	uint32_t id = view.NextUint32();

	int32_t x = view.NextInt32();
	int32_t y = view.NextInt32();
    
    int32_t velX = view.NextInt32();
    int32_t velY = view.NextInt32();
    
    double alpha = view.NextDouble();
    
    uint8_t armor = view.NextUint8();
    
	int16_t radius = view.NextInt16();	

	uint16_t flags = view.NextInt16();
    bool isFood = flags & 1;
    bool isBullet = flags & 2;
//    bool isFleet = !isFood & !isBullet;
    
    int32_t bulletLife, maxBulletLife;
    if (isBullet) {
		bulletLife = view.NextInt32();
		maxBulletLife = view.NextInt32();
    }
	
	int16_t decayTick = 0;
	int16_t decayTotalTick = 0;
	bool isInDecay = flags & 4;
	bool isSplitting = flags & 8;
	bool shouldExplode = flags & 16;
    
	if(isInDecay) 
	{
		decayTick = view.NextInt16();
		decayTotalTick = view.NextInt16();
	}

	//------------- FINISHED RECEIVING DATA ------------//
	
	Cell *cell = m_pGame->Cells()->ByID(id);
	
	if(cell == nullptr)
	{
        if (isBullet) {
			if(m_fAverageElapsedTimeBetweenUpdates != 0)
			{
				//Debug("X offset is: %f, Y offset is: %f", (m_fAverageLatency / m_fAverageElapsedTimeBetweenUpdates * velX), (m_fAverageLatency / m_fAverageElapsedTimeBetweenUpdates * velY));
				//Debug("Elapsed time: %f", m_fAverageElapsedTimeBetweenUpdates);
				x = x + (m_fAverageLatency / m_fAverageElapsedTimeBetweenUpdates * velX);
				y = y + (m_fAverageLatency / m_fAverageElapsedTimeBetweenUpdates * velY);
			}

            cell = new Bullet (id, x, y, velX, velY, radius, bulletLife, maxBulletLife);
        } else {
            cell = new Cell (id, x, y, velX, velY, radius);

			//if(isFood) cell->SetAlpha(0.0);
        }

		m_pGame->Cells()->RegisterCell(cell);

		if(fleet != nullptr && !isFood)
		{
			//Debug("Adding Cell with [ID: %u] from [Fleet: %s] <-----------", cell->GetID(), fleet->GetName().c_str());
		}
	}
	else
	{
		cell->Update(x, y, velX, velY);
	}

	cell->SetIsFood(isFood);
	cell->SetIsBullet(isBullet);
	cell->SetDecay(decayTick, decayTotalTick);

	if(fleet != nullptr && !cell->IsFood())
	{
		fleet->AddCellToFleet(cell);
		cell->SetFleet(fleet);
	}
    
	if(m_pGame->Cells()->IsMine(id) && !m_pGame->Cells()->IsMine(cell))
	{
		//Debug("Adding my cell");
		bool hadCells = m_pGame->Cells()->PlayerHasCells();
		m_pGame->Cells()->AddMyCell(cell);
		
		// Our first cell
		if(!hadCells)
		{
			Camera c;
			c.y = cell->GetX();
			c.y = cell->GetY();
			c.zoom = 1.0;
			m_pGame->Rendering()->SetCamera(c);
			m_bIsPlayerSpectating = false;
			m_pGame->OnPlayerSpawn();
		}
	}
    
    cell->SetSplitting(isSplitting);
    if(!isFood)cell->SetAlpha(alpha);
    cell->SetArmor(armor);
	cell->SetShouldExplode(shouldExplode);

	return false;
}

void GameNetworking::HandleDeletedCellsDecoding(BinView &view, bool justLostMyCell)
{
	uint32_t id = view.NextUint32();

	uint8_t flags = view.NextUint8();

    bool shouldExplode = flags & 1;

	Cell *cell = m_pGame->Cells()->ByID(id);

	if(m_pGame->Cells()->IsMine(cell))
	{
		justLostMyCell = true;
	}

	if(g_Game.Rendering()->GetGraphicSettings() == GameRendering::GraphicSettings::HIGH)
	{
		//Since bullets are only encoded in time of creation and deletion, we need this safe check for them
		if(cell != nullptr && (cell->ShouldExplode() || shouldExplode))
		{
			auto particleSystem = g_Game.Cells()->GetAvailableParticleSystem();
			if(particleSystem != nullptr)
			{
				if(cell->IsFood())
				{
					particleSystem->MakeParticleExplosion(-M_PI, M_PI, EXPLOSION_VELOCITY, cell->GetRadius() * 5, 2, 1, cell->GetFoodIndex(), 2, cell->GetX(), cell->GetY(), Particle::ParticleType::CIRCLE);
				}

				if(cell->IsBullet())
				{
					cell->ClearTrailParticles();
					particleSystem->MakeParticleExplosion(-M_PI, M_PI, EXPLOSION_VELOCITY, cell->GetRadius() * 2, 2, 1, cell->GetFleet()->GetSelectedSet(), 2, cell->GetX(), cell->GetY(), Particle::ParticleType::SQUARE);
				}

				if(cell->IsBoid())
				{
					particleSystem->MakeParticleExplosion(-M_PI, M_PI, EXPLOSION_VELOCITY, cell->GetRadius() * 2.5, 2, 1, cell->GetFleet()->GetSelectedSet(), 2, cell->GetX(), cell->GetY(), Particle::ParticleType::TRIANGLE);
				}
			}
		}
	}

	cell->Destroy(justLostMyCell);
	
	if(justLostMyCell && !m_pGame->Cells()->PlayerHasBoids())
	{
		m_pGame->OnPlayerDeath();
	}
}

bool GameNetworking::SendNick(const std::string &str, int selectedSet)
{
    if(g_Game.IsPlayerAlive()) {
        Debug("Send Nick failed because we are already playing!");
        return false;
    }
    
	if(m_bConnected)
	{
		BinData out;
        out.PushUint8(0xFD);
		out.PushUTF8String(str);
		out.PushUint8(0);
		out.PushUint8(selectedSet);
		Write(out);

		Debug("We sent nick and selected set is %d", selectedSet);
		m_bSentNick = true;
		js_has_sent_nick();
	}
	else
	{
		Debug("Send Nick failed because we were not connected yet");
		m_SendNickOnConnect = str;
		m_bWantsToPlay = true;
		m_iSelectedSet = selectedSet;
		m_bSentNick = false;
	}

	m_pGame->Rendering()->SetSelectedSet(selectedSet);

	return m_bSentNick;
}

void GameNetworking::ConnectionFailsafe()
{
	if(m_bSpectateOnConnect)
	{
		m_bSpectateOnConnect = false;
		Spectate();
	}

	if(m_bWantsToPlay)
	{
		if(SendNick(m_SendNickOnConnect, m_iSelectedSet))
		{
			m_SendNickOnConnect.clear();
			m_bWantsToPlay = false;
		}
	}
}

void GameNetworking::Spectate()
{
	if(m_bConnected)
	{
		m_bIsPlayerSpectating = true;
		WriteByte(0x01);
	}
	else
	{
		m_bSpectateOnConnect = true;
	}
}

void GameNetworking::ForceSendMousePosition()
{
	double targetX = m_pGame->Mouse()->GameX();
	double targetY = m_pGame->Mouse()->GameY();
    
    targetX = std::max(targetX, m_pGame->Rendering()->GetMinX());
    targetY = std::max(targetY, m_pGame->Rendering()->GetMinY());
    targetX = std::min(targetX, m_pGame->Rendering()->GetMaxX());
    targetY = std::min(targetY, m_pGame->Rendering()->GetMaxY());
    
    double screenMousePosX = m_pGame->Mouse()->MousePosDistanceToCenterX();
    double screenMousePosY = m_pGame->Mouse()->MousePosDistanceToCenterY();

    BinData out;
    out.PushUint8(C2S_SET_TARGET);
    
    double angle = atan2(screenMousePosY, screenMousePosX);
    out.PushInt32(int32_t(targetX));
    out.PushInt32(int32_t(targetY));
    out.PushDouble(double(angle));
	
	Write(out);
}

void GameNetworking::SendSplitAndDashOrder() {
    BinData out;
    out.PushUint8(OUT_SPLIT_AND_DASH);
    Write(out);
}

#ifdef DEBUG
void GameNetworking::CreateTestMessage() {
    m_pGame->Rendering()->GetAnnouncementsManager()->Create("Geraldes YEAH!", AnnouncementType::MESSAGE, true);
    m_pGame->Rendering()->GetAnnouncementsManager()->Create("+50", AnnouncementType::KILL_POINTS);
}
#endif

void GameNetworking::Write(const char *data, int len){
	if(m_pMaestroHandler.IsInTunnelMode())
	{
		m_pMaestroHandler.WriteToMaestro(data, len);
	}
	else
	{
		if(!m_pGameServerSocket) return;
		
		LogUpload(len);
		m_pGameServerSocket->Write(data, len);
	}
}

void GameNetworking::LogUpload(size_t len){
#ifdef DEBUG
	
	// Add websocket overhead
	if(len < 126){
		len += 6;
	}else if(len < 64 * 1024){
		len += 8;
	}else{
		len += 12;
	}
	
	m_iTotalUpload += len;
	m_UploadInfo.push_back({(float) m_pGame->Now(), (int) len});
#endif
}

#define LOG_WINDOW 3000 /* in ms */

void GameNetworking::LogDownload(size_t len){
#ifdef DEBUG
	// Add websocket overhead
	if(len < 126){
		len += 2;
	}else if(len < 64 * 1024){
		len += 4;
	}else{
		len += 8;
	}
	
	m_iTotalDownload += len;
	m_DownloadInfo.push_back({(float) m_pGame->Now(), (int) len});
#endif
}

void GameNetworking::CleanLogs(){
#ifdef DEBUG
	size_t i;
	float now = m_pGame->Now();
	
	for(i = 0; i < m_UploadInfo.size(); ++i){
		if(now - m_UploadInfo[i].time < LOG_WINDOW) break;
	}
	
	m_UploadInfo.erase(m_UploadInfo.begin(), m_UploadInfo.begin() + i);
	
	
	for(i = 0; i < m_DownloadInfo.size(); ++i){
		if(now - m_DownloadInfo[i].time < LOG_WINDOW) break;
	}
	
	m_DownloadInfo.erase(m_DownloadInfo.begin(), m_DownloadInfo.begin() + i);
#endif
}

#ifdef DEBUG

int GameNetworking::GetDownloadRate(){
	int acc = 0;
	for(auto &v : m_DownloadInfo) acc += v.amount;
		
	double logWindow = std::min<double>(LOG_WINDOW, m_pGame->Now() - m_pGame->GetStartTime()) / 1000.0;
	if(logWindow < 0.1) logWindow = 0.1;
	
	return acc / logWindow;
}

int GameNetworking::GetUploadRate(){
	int acc = 0;
	for(auto &v : m_UploadInfo) acc += v.amount;
	
	double logWindow = std::min<double>(LOG_WINDOW, m_pGame->Now() - m_pGame->GetStartTime()) / 1000.0;
	if(logWindow < 0.1) logWindow = 0.1;
	
	return acc / logWindow;
}

#endif

bool GameNetworking::PollGameServerSocket()
{
	if(!m_pGameServerSocket) return false;

	cp5::ws_event e;
	char *data;
	int len;

	while((e = m_pGameServerSocket->Poll(&data, &len)) != cp5::WS_NOTHING)
	{
		if(e == cp5::WS_CONNECTED)
		{
			OnConnectedToGameServer();
		}
		else if(e == cp5::WS_ERROR)
		{
			Debug("Socket error");
			js_notify_disconnected();
			return true;
		}
		else if(e == cp5::WS_CLOSE)
		{
			Debug("Socket closed");
			js_notify_disconnected();
			return true;
		}
		else if(e == cp5::WS_DATA)
		{
			LogDownload(len);
			OnData(data, len);
			free(data);
		}
	}

	return false;
}

void GameNetworking::OnConnectedToGameServer()
{
	Debug("Connected to GameServer!");

	js_notify_connected();
	m_pMaestroHandler.SetIsConnectedToGameServer(true);
	m_bConnected = true;

	BinData out;
	out.PushUint8(IN_INIT_SESSION);
	Write(out);
}

//Interface methods
void GameNetworking::OnData(const char *data, int len)
{
	//Debug("NETWORKING: My OnData sense is tingling!");

	if(len == 0) return;
	
	BinView view{data, len};
	
	uint8_t type = view.NextUint8();
	//Debug("Got packet: 0x%02X", int(type));
	if(m_PacketProcessors[type]){
		m_PacketProcessors[type](view);
	}else{
		Debug("Unknown packet type 0x%02X", int(type));
	}
}

void GameNetworking::OnDisconnect(bool forcedDisconnect, bool isReconnection)
{
	Debug("Game Networking disconnect was called");
	m_pMaestroHandler.SetIsConnectedToGameServer(false);
	m_bConnected = false;
	m_pGame->OnDisconnect(forcedDisconnect, isReconnection);
}

void GameNetworking::ConnectToGameServer(const char *ip)
{
	if(m_pGameServerSocket) return;

	m_pGameServerSocket = std::unique_ptr<WebSocket>(new WebSocket(ip));

	//Create the socket and start checking it for message
	//main.cpp is busy checking maestro socket
	cp5::check_ws_callback([]()
	{
		if(g_Game.Networking()->PollGameServerSocket())
		{
			Game::Reset();
		}
	});
}

void GameNetworking::SendAutofireInformation(bool isInAutofire)
{
	BinData out;
	out.PushUint8(OUT_AUTOFIRE);
	out.PushUint8(isInAutofire);
	Write(out);
}

void GameNetworking::CalculateUpdateTime()
{
	m_fCurrentUpdateTime = std::chrono::high_resolution_clock::now();
	double elapsedTimeBetweenUpdates = std::chrono::duration_cast<std::chrono::milliseconds>(m_fCurrentUpdateTime - m_fTimeSinceLastUpdate).count();
	m_fTimeSinceLastUpdate = m_fCurrentUpdateTime;

	if(m_iCurrentUpdateTimeArrayIndex >= m_UpdateTime.size())
	{
		m_iCurrentUpdateTimeArrayIndex = 0;
	}

	m_fAverageElapsedTimeBetweenUpdates = CalculateAverageValueFromArray(m_UpdateTime, elapsedTimeBetweenUpdates, m_iCurrentUpdateTimeArrayIndex++);
}

template <size_t SIZE>
double GameNetworking::CalculateAverageValueFromArray(std::array<double, SIZE> &array, double spotValue, int index)
{
	//Debug("Current Array Index is: %d", index);

	array[index] = spotValue;
	double sumValue = 0.0;

	for(size_t i = 0; i < array.size(); i++)
	{
		//Debug("Value [%u] is: %f", i, array[i]);
		sumValue += array[i];
	}

	//Debug("Average Value is: %fms", sumValue / array.size());

	return sumValue / array.size();
}

