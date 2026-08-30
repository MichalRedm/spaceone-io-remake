#ifndef GAMENETWORKING__H
#define GAMENETWORKING__H

#include "libs/maestro_cpp_client_sdk/MaestroConnectionHandler.h"
#include "libs/maestro_cpp_client_sdk/IGameNetworking.h"

#define LATENCY_ARRAY_SIZE 5
#define UPDATE_TIME_ARRAY_SIZE LATENCY_ARRAY_SIZE

class Fleet;
class Announcement;
class Game;
class GameNetworking : IGameNetworking 
{
	struct ScoreboardEntry 
	{
		bool isMe;
		std::string name;
		uint32_t score;
		Color color;
	};
	
public:
	//Constructors
	GameNetworking(Game *game);
	
	//Getters
	inline bool IsConnected(){ return m_bConnected; }
	inline bool IsForcedDisconnect() { return m_bIsForcedDisconnect; }
	inline bool IsSpectating(){ return m_bIsPlayerSpectating; }
	inline const std::vector<ScoreboardEntry>& GetScoreboard(){ return m_Scoreboard; }
	inline const std::vector<float>& GetTeamsScoreboard(){ return m_TeamScoreboard; }
	inline MaestroConnectionHandler& GetMaestroConnectionHandler() { return m_pMaestroHandler; }
	/*inline double GetAverageLatency() { return m_fAverageLatency; }
	inline double GetShootingLatency() { return m_fShootingLatency; }*/

	//Setters

	//Other Inline funcs
	inline bool HasConnection() { return m_pMaestroHandler.HasConnection(); }
	inline void CloseMaestroSocket() { m_bIsForcedDisconnect = true; m_bConnected = false; GetMaestroConnectionHandler().CloseMaestroSocket(); }

	//Other Non-Inline funcs
	void Think();
	void Spectate();
	void EverySecond();
		//IO Handling funcs
	void Write(const BinData &data){ Write((const char *) data.GetData(), data.GetDataLength()); }
	void WriteByte(uint8_t v){ Write((const char *)&v, 1); }
	void Write(const char *data, int len);
	bool SendNick(const std::string &str, int selectedSet);
	void SendAutofireInformation(bool inAutofire);
	void ForceSendMousePosition();
    void SendSplitAndDashOrder();
		//Interface methods -> IGameNetworking
	void OnDisconnect(bool forcedDisconnect = false, bool isReconnection = false);
	void OnData(const char *data, int len);
	void ConnectToGameServer(const char *ip);
	void OnConnectedToGameServer();
	void ConnectionFailsafe();
	void LogDownload(size_t len);
	void LogUpload(size_t len);
    
#ifdef DEBUG
    void CreateTestMessage();
	int GetDownloadRate();
	int GetUploadRate();
	int GetTotalDownload(){ return m_iTotalDownload; }
	int GetTotalUpload(){ return m_iTotalUpload; }
#endif
    
private:
	void WorldUpdate(BinView &view);
    void UpdateBulletsPosition();
    void UpdateMaxNumberOfBoidsStat();
	Fleet* HandleFleetDecoding(BinView &view);
	bool HandleCellDecoding(BinView &view, Fleet *fleet);
	void HandleDeletedCellsDecoding(BinView &view, bool justLostMyCell);
    void HandleBulletCloudDecoding(BinView &view, Fleet* fleet);
	void CalculateUpdateTime();

	template <size_t SIZE>
	double CalculateAverageValueFromArray(std::array<double, SIZE> &array, double spotValue, int index);
	
	void CleanLogs();
	
	//WebSocketHandlers
	void Connect(const char *ip);
	bool PollGameServerSocket();
	
	Game *m_pGame;
	MaestroConnectionHandler m_pMaestroHandler;
	std::unique_ptr<WebSocket> m_pGameServerSocket;
	
	double m_fLastTargetUpdate = 0.0;
    double m_fLastNetworkingUpdate = 0.0;
    double m_fBulletSpeedAdjustment = 0.0f;

	std::array<double, LATENCY_ARRAY_SIZE> m_Latency;
	int m_iCurrentLatencyArrayIndex = 0;
	double m_fAverageLatency = 0.0;
	std::chrono::high_resolution_clock::time_point m_PingMessageTime;
	std::chrono::high_resolution_clock::time_point m_PongMessageTime;

	std::chrono::high_resolution_clock::time_point m_fCurrentUpdateTime;
	std::chrono::high_resolution_clock::time_point m_fTimeSinceLastUpdate;
	std::array<double, UPDATE_TIME_ARRAY_SIZE> m_UpdateTime;
	int m_iCurrentUpdateTimeArrayIndex = 0;
	double m_fAverageElapsedTimeBetweenUpdates = 0.0;
    
    std::string m_SendNickOnConnect;
    bool m_bIsHuman = true;
	int m_iSelectedSet;
    bool m_bUpdateBulletPos = false;
	bool m_bHasSolvedFirstChallenge = false;
	bool m_bSpectateOnConnect = false;
	bool m_bHasInitialMapBorders = false;
	bool m_bConnected = false;
	bool m_bIsForcedDisconnect = false;
	bool m_bIsPlayerSpectating = false;
	bool m_bWantsToPlay = false;
	bool m_bSentNick = false;
    bool m_bIsDangerZone = false;
    Announcement* m_dangerAnnouncement;

	std::vector<ScoreboardEntry> m_Scoreboard;
	std::vector<float> m_TeamScoreboard;
	std::vector<std::function<void(BinView &view)>> m_PacketProcessors{256};
	
#ifdef DEBUG
	struct NetworkInfo {
		float time;
		int amount;
	};
	
	int m_iTotalUpload = 0;
	int m_iTotalDownload = 0;
	std::vector<NetworkInfo> m_UploadInfo;
	std::vector<NetworkInfo> m_DownloadInfo;
	
#endif
};

#endif
