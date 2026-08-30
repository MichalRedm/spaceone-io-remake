#ifndef MAESTROCONNECTIONHANDLER__H
#define MAESTROCONNECTIONHANDLER__H

#include "libs/user_proto_compilation_files/maestro_user.pb.h"
#include "IGameNetworking.h"

#pragma once
/*
class MaestroConnectionHandler {	
public:
	MaestroConnectionHandler(IGameNetworking* gameNetworking) : m_pGameNetworking(gameNetworking) {}
	inline bool IsInTunnelMode() { return m_bIsProxyClient; }
	inline void SetIsConnectedToGameServer(bool isConnectedToGameServer) { m_bIsConnectedToGameServer = isConnectedToGameServer; }

	//WebSocketHandler
	inline bool HasConnection(){ return (bool) m_pMaestroSocket; }
	inline void CloseMaestroSocket() { m_bIsConnectedToGameServer = false; m_bForcedDisconnect = true; m_pMaestroSocket = nullptr; }
	void ConnectToMaestro(const char *maestroIp);
	bool PollMaestroSocket();
	void ReconnectToArena();
	void SortOutgoingEnterGameRequests(const char* arenaLink, bool hasNewArenaLink);
	void Write(const char *data, int len); 
	void WriteToMaestro(const char *data, int len);
private:

	//WebSocketHandler
	void OnConnectedToMaestro();
	void OnGameServerConnectionSuccessful();
	void OnDataFromMaestro(const std::string& data);
	void WriteToMaestro(const maestro::user_proto::envelope& envelope); 

	//Incomming Message handling
	void HandleCompressedEnvelope(const std::string& compressedData, unsigned int length, unsigned int uncompressLength);
	void HandleUncompressedEnvelope(const maestro::user_proto::msg& message);
	void HandleCreateSessionResponse(const bool isPlaying, const maestro::user_proto::create_session_response& response);
	void HandleEnterGameResponse(const maestro::user_proto::enter_game_response& response);
	void HandleDisconnect(const maestro::user_proto::disconnect& disconnect);
	void HandleGeoLocationResponse(const maestro::user_proto::geo_location_response& response);

	//Outgoing messages
	void RequestPlayerLocalization();
	void AnswerMaestroWithPong(const uint32_t sequenceNumber);
	void SendEnterGameRequest(const char* arenaLink, bool hasNewArenaLink);

	//Utils
	std::string UncompressBytes(const void* bytes, unsigned int length, unsigned int uncompressLength);
	void ConnectToMaestro(const std::string& maestroIp) { ConnectToMaestro(maestroIp.c_str()); }

	std::unique_ptr<WebSocket> m_pMaestroSocket;

    bool m_bIsProxyClient = false;
	bool m_bIsConnectedToGameServer = false;
	bool m_bForcedDisconnect = false;

	std::string m_SessionToken;

	IGameNetworking* m_pGameNetworking;
};
*/
#endif