#ifndef GAMERENDERING__H
#define GAMERENDERING__H
#pragma once

#include "Camera.h"
#include "Screen.h"
#include "Grid.h"
#include "HiddenValue.h"
#include "AnnouncementsManager.h"

#define SCOREBOARD_MAX_SIZE 10

class Game;
class GameRendering {
public:
	enum GraphicSettings
	{
		HIGH,
		MEDIUM,
		LOW
	};

	struct ArenaHighscorer
	{
		std::string playerName;
		uint32_t score;
	};

	//Constructors
    GameRendering(Game *game) : m_pGame(game){ m_AnnouncementsManager = new AnnouncementsManager(); }
	
	//Getters
	inline double GetMinX(){ return m_fMinX; }
	inline double GetMinY(){ return m_fMinY; }
	inline double GetMaxX(){ return m_fMaxX; }
    inline double GetMaxY(){ return m_fMaxY; }

	//inline Pixi& GetPixi() { return pixi; }
    
    inline double GetDeadZoneMinX(){ return m_fDeadZoneMinX; }
    inline double GetDeadZoneMinY(){ return m_fDeadZoneMinY; }
    inline double GetDeadZoneMaxX(){ return m_fDeadZoneMaxX; }
    inline double GetDeadZoneMaxY(){ return m_fDeadZoneMaxY; }
    
    inline float ScreenX(float v){ return GetZoom() * (v - m_Camera.x) + g_Screen.width / 2.0; }
    inline float ScreenY(float v){ return GetZoom() * (v - m_Camera.y) + g_Screen.height / 2.0; }

	inline float GameX(float v){ return GameW(v - g_Screen.width  / 2.0) + m_Camera.x; }
	inline float GameY(float v){ return GameH(v - g_Screen.height / 2.0) + m_Camera.y; }
	inline float GameW(float v){ return v / GetZoom(); }
	inline float GameH(float v){ return v / GetZoom(); }

	template<typename T>
	inline T DistanceSquared(T x1, T y1, T x2, T y2){
	return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
	}

	template<typename T>
	inline T Distance(T x1, T y1, T x2, T y2) {
	return sqrt(DistanceSquared(x1, y1, x2, y2));
	}
	
	inline int GetTick(){ return m_iTick; }
	inline const Camera& GetCamera(){ return m_Camera; }
	inline double GetCameraX(){ return m_Camera.x; }
	inline double GetCameraY(){ return m_Camera.y; }
	inline double GetZoom(){ return m_Camera.zoom; }

	inline double GetDesiredZoom(){ return m_fDesiredZoom; }
	inline double GetDesiredFinalZoom(){ return m_fDesiredZoom * GetZoomScreenFactor(); }
	inline double GetZoomScreenFactor(){ return std::max(g_Screen.height / 1080.00, g_Screen.width / 1920.0); }
    inline AnnouncementsManager* GetAnnouncementsManager() { return m_AnnouncementsManager; }
	inline GraphicSettings GetGraphicSettings() { return m_GraphicSettings; }
	
	//Setters
	inline void SetCamera(const Camera &c){ m_Camera = c; }
	inline void SetSpectatorCamera(const Camera &c){ m_SpecCamera = c; }
	inline void SetMyFleetName(const std::string& name) { m_MyFleetName = name; }
	inline void SetLeaderCoordinates(const float leaderX, const float leaderY) { m_fLeaderX = leaderX; m_fLeaderY = leaderY;}
	inline void SetSelectedSet(const uint8_t selectedSet) { m_iSelectedSet = selectedSet; }
	inline void SetIsInAutofire(bool isInAutofire) { m_bIsInAutofire = isInAutofire; }
	inline void SetShouldRenderLeader(bool shouldRenderLeader) { m_bShouldRenderLeader = shouldRenderLeader; }
	inline void SetArenaHighscorer(std::string playerName, uint32_t score) { m_ArenaHighScorer.playerName = playerName; m_ArenaHighScorer.score = score; }
	inline void SetCurrentKillStreak(uint32_t killStreak) { m_iKillStreak = killStreak; }

	//Other Inline funcs
	inline int ScreenSpace(double v){ return v * std::min(g_Screen.width / 1920.0, g_Screen.height / 1080.0); }
	inline void UpdateMapDimensions(double minX, double minY, double maxX, double maxY){ m_fMinX = minX; m_fMinY = minY; m_fMaxX = maxX; m_fMaxY = maxY; }
	void UpdateDeadZoneMapDimensions(double minX, double minY, double maxX, double maxY){ m_fDeadZoneMinX = minX; m_fDeadZoneMinY = minY; m_fDeadZoneMaxX = maxX; m_fDeadZoneMaxY = maxY; }

	//Other Non-Inline funcs
    inline void ResetBackgroundAlpha() { m_fBackgroundAlpha = 1.0f; }
	void Render(Context *ctx);
    void EverySecond();
	void OnResize();
	void OnIdle();
	void UpdateScoreboard();
	void UserZoom(double amount);
	bool CanShoot();
	void SetSlowFadeout();
	void SetGraphics(const char* setting);
	Image* GetImageByName(std::string imageName);
	
//Debug
#ifdef DEBUG
	//Inline
	inline void ToggleDebug() { m_bDrawDebug = !m_bDrawDebug; };
	inline void ToggleSprites() { m_bUseAssets = !m_bUseAssets; };
	inline bool UseSprites() { return m_bUseAssets; };

	//Non-Inline
	void FinishedFrame(Context *ctx, double took);
#endif
	void RenderPlayerNamePixi();
	void RenderBackgroundPixi();
    
private:
	void SolveCamera();
	void CalculateDesiredZoom();
	void CheckFPSWarning();
	void LimitUserZoom();
	
	//PIXI TEST
	Pixi pixi;

	//Render funcs
	void RenderGrid(Context *ctx);
    void RenderBackground(Context *ctx);
    void RenderForeground(Context *ctx);
	void RenderScoreboard(Context *ctx);
	void RenderArenaHighscorer(Context *ctx);
	void RenderKillStreak(Context *ctx);
	void RenderFadeout(Context *ctx);
	void RenderConnecting(Context *ctx);
	void RenderFleets(Context *ctx);
	void RenderOtherCells(Context *ctx);
    void RenderDangerZone(Context *ctx);
	void RenderScore(Context *ctx);
	void RenderPlayerName(Context *ctx);
	void RenderAutofire(Context *ctx);
    void RenderPlayerStats(Context *ctx);
    void RenderGauge(Context *ctx);
    void RenderBorders(Context *ctx);
	void RenderAnnouncements(Context *ctx);
	void RenderLogo(Context *ctx);
	void RenderLeaderArrow(Context *ctx);
	void RenderLeaderboardCell(int pos, int realPos, std::string name, int score, bool isMe, Color color, Context *ctx);
	void RenderWarning(Context *ctx);

	Game *m_pGame;

	std::unordered_map<std::string, std::shared_ptr<Image>> m_pGameImages;
	
	int m_iTick = 0;
	int m_iUnflushedFrames = 0;
	int m_iFPS = 0;
	bool m_bFirstRender = true;

	GraphicSettings m_GraphicSettings = GraphicSettings::HIGH;
	
	bool m_bPointsDirty = true;
	
    double m_fBackgroundAlpha = 1.0;
    
    AnnouncementsManager* m_AnnouncementsManager;
    
	double m_fMinX = 0.0;
	double m_fMinY = 0.0;
	double m_fMaxX = 0.0;
	double m_fMaxY = 0.0;
    
    double m_fDeadZoneMinX = 0.0;
    double m_fDeadZoneMinY = 0.0;
    double m_fDeadZoneMaxX = 0.0;
    double m_fDeadZoneMaxY = 0.0;

	float m_fLeaderX;
	float m_fLeaderY;

	ArenaHighscorer m_ArenaHighScorer{"", 0};

	uint32_t m_iKillStreak = 0;

	bool m_bIsInAutofire = false;
	bool m_bShouldRenderLeader = false;
    
    bool m_bRenderingArenaClosingMessage = false;

	//Just a configurable parameter
	bool m_bMinimalisticUI = true;

	std::string m_MyFleetName;
	uint8_t m_iSelectedSet;
	
	Camera m_Camera;
	Camera m_SpecCamera;
	double m_fAnimZoom = 1.0;
	HiddenValue<double> m_fUserZoom = 1.0;
	HiddenValue<double> m_fDesiredZoom = 1.0;
	
	bool m_bHasScoreboard = false;
	bool m_bShowFPSWarning = false;
    
	int m_iLowFpsCounter = 0;
	int m_iWarningVisibleCounter = 0;
	Context m_ScoreboardCtx;
	Context m_WarningCtx;
    
    Image* m_Grid = nullptr;
	
	Text m_BonusPointsText{0.0, Color(255, 255, 255), false, Color(0, 0, 0), 0.2};
    Text m_ScoreText{0.0, Color(255, 255, 255), false, Color(0, 0, 0), 0.2};
	Text m_NameText{0.0, Color(255, 255, 255), false, Color(0, 0, 0), 0.2};
    Text m_StatsText{0.0, Color(255, 255, 255), false, Color(0, 0, 0), 0.2};
	Text m_KillStreakText{0.0, Color(255, 255, 255), false, Color(0, 0, 0), 0.2};
	Text m_ArenaHighscorerTextLine1{0.0, Color(255, 255, 255), false, Color(0, 0, 0), 0.2};
	Text m_ArenaHighscorerTextLine2{0.0, Color(255, 255, 255), false, Color(0, 0, 0), 0.2};
	Text m_AutofireText{0.0, Color(255, 255, 255), false, Color(0, 0, 0), 0.2};
	
	Text m_ConnectingText{0.0, Color(255, 255, 255), false, Color(0, 0, 0), 0.2};
	
#ifdef DEBUG
    void DrawConfigInfo(Context *ctx);
	void DrawFPS(Context *ctx);
	void DrawMemory(Context *ctx);
	void DrawNetwork(Context *ctx);

	bool m_bDrawDebug = false;
    bool m_bUseAssets = true;

    Text m_ConfigText{0.0, Color(255, 255, 255), true, Color(0, 0, 0), 0.2};
	Text m_FPSMeter{0.0, Color(255, 255, 255), true, Color(0, 0, 0), 0.2};
	std::vector<double> m_FrameTimes;
	Text m_MemoryText{0.0, Color(255, 255, 255), true, Color(0, 0, 0), 0.2};
	Text m_NetworkText{0.0, Color(255, 255, 255), true, Color(0, 0, 0), 0.2};
#endif
	
};

#endif
