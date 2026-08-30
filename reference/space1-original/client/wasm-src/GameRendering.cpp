#include "stdafx.h"
#include "GameRendering.h"
#include "Game.h"
#include "Announcement.h"

// what is the fps threshold to activate the warning
#define WARNING_FPS_THRESHOLD 20 
// how many seconds the fps needs to be under the threshold for the warning to be activated
#define WARNING_FPS_LOW_COUNTER 5
// how many seconds the warning will be shown
#define TIME_TO_SHOW_WARNING 10

#define DEAD_ZONE 75.0

namespace {
	double s_fFadeoutAmount = 1.0;
	bool s_bSlowFadeout = false;
}


void GameRendering::Render(Context *ctx){
	++m_iTick;
	++m_iUnflushedFrames;

	SolveCamera();
    //RenderGrid(ctx);
	RenderBackground(ctx);
    RenderDangerZone(ctx);
    RenderBorders(ctx);
    
	ctx->Save();
	ctx->Translate(int(g_Screen.width / 2), int(g_Screen.height / 2));
	ctx->Scale(GetZoom(), GetZoom());
	ctx->Translate(-m_Camera.x, -m_Camera.y);
	RenderFleets(ctx);
	RenderOtherCells(ctx);
	RenderLeaderArrow(ctx);
	ctx->Restore();
	
    RenderForeground(ctx);
	RenderScoreboard(ctx);
	RenderArenaHighscorer(ctx);
//	RenderKillStreak(ctx);
	RenderScore(ctx);
	RenderPlayerName(ctx);
	RenderAutofire(ctx);
    RenderGauge(ctx);
    RenderPlayerStats(ctx);

	RenderWarning(ctx);

	RenderAnnouncements(ctx);
	RenderFadeout(ctx);
	RenderConnecting(ctx);

#ifdef DEBUG
	DrawFPS(ctx);
	//pixi.Render();
	//DrawMemory(ctx);
	//DrawNetwork(ctx);
	//DrawConfigInfo(ctx);
#endif
	
	m_bPointsDirty = true;
}

void GameRendering::EverySecond()
{
	m_iFPS = m_iUnflushedFrames;
	m_iUnflushedFrames = 0;
	
	CheckFPSWarning();
}

void GameRendering::CheckFPSWarning()
{
	if(!m_pGame->IsPlayerAlive()) return;

	if(m_iFPS < WARNING_FPS_THRESHOLD)
	{
		m_iLowFpsCounter++;
		
		if(m_iLowFpsCounter > WARNING_FPS_LOW_COUNTER && m_iWarningVisibleCounter == 0)
		{
			m_bShowFPSWarning = true;
		}

	}
	else
	{
		m_iLowFpsCounter = 0;
	}

	if(m_bShowFPSWarning)
	{
		m_iWarningVisibleCounter++;
		if(m_iWarningVisibleCounter > TIME_TO_SHOW_WARNING)
		{
			m_bShowFPSWarning = false;
			m_iWarningVisibleCounter = -1;
			m_iLowFpsCounter = 0;
		}
	}
}

void GameRendering::OnIdle()
{
	if(!cp5::has_idle_time_left()) return;
	if(!cp5::has_idle_time_left()) return;
	
	// If we have any dirty Text instances, redraw them
	m_pGame->Cells()->ForEach([&](Cell *c)
	{
		c->UpdatePos();
		if(!cp5::has_idle_time_left()) return;
	});
}

void GameRendering::OnResize()
{
	UpdateScoreboard();
}

void GameRendering::RenderFleets(Context *ctx)
{  
    // Render each fleet, each fleet will render its cells
    g_Game.Cells()->ForEachFleet([&](Fleet *fleet)
	{
        fleet->Render(ctx);
		//Debug("----------------------------");
		//Debug("Will try to render %zu Fleets", g_Game.Cells()->GetFleetNumber());
		fleet->ConservativeRenderTexts(ctx);
		//Debug("--------------------------");
    });
    
#ifdef DEBUG
    if(m_pGame->Cells()->PlayerHasCells() && m_bDrawDebug)
	{
        Fleet* myFleet = m_pGame->Cells()->GetMyFleet();
        //bool drawnBoidMetaInfo = false;

		auto myCells = myFleet->GetMyFleet();
        for(Cell* cell : myCells)
		{
            cell->DebugDraw(ctx);            
        }

		g_Game.Cells()->GetMyFleet()->ConservativeDebugRender(ctx);
    }
#endif
}

void GameRendering::RenderOtherCells(Context *ctx)
{
	g_Game.Cells()->ForEachNonBoid([&](Cell *cell)
	{
        cell->Render(ctx);
    });

	if(m_GraphicSettings == GraphicSettings::HIGH)
	{
		g_Game.Cells()->ForEachParticleSystem([&](std::shared_ptr<ParticleSystem> particleSystem)
		{
			if(particleSystem != nullptr)
				particleSystem->Render(ctx);
		});
	}
}

void GameRendering::RenderLeaderArrow(Context *ctx)
{
 	if(!m_bShouldRenderLeader) return;

	float border = ScreenSpace(50.0);

	float edgeLeft   = GameX(border);
	float edgeTop    = GameY(border);
	float edgeRight  = GameX(g_Screen.width - border);
	float edgeBottom = GameY(g_Screen.height - border);


	float ax = Clamp(m_fLeaderX, edgeLeft, edgeRight);
	float ay = Clamp(m_fLeaderY, edgeTop, edgeBottom);

	float dist = Distance(m_fLeaderX, m_fLeaderY, ax, ay);

	//If leader is close to the player, we don't show the arrow
	if(ax > edgeLeft && ax < edgeRight && ay > edgeTop && ay < edgeBottom) return;

	float ang = atan2(m_fLeaderY - ay, m_fLeaderX - ax);

	ctx->Save();

	ctx->SetAlpha(0.35 * Clamp<float>((dist - g_Screen.width / 10) / 100, 0.0, 1.0));

	ctx->Translate(ax, ay);
	ctx->Rotate(ang + M_PI_2);

	Image *arrowLeaderImg = GetImageByName("Leader_Arrow");
	double arrowLeaderImgWidth = arrowLeaderImg->Width() / 1.5;
	double arrowLeaderImgHeight = arrowLeaderImg->Height() / 1.5;
	ctx->DrawImage(arrowLeaderImg, - arrowLeaderImgWidth / 2, - arrowLeaderImgHeight / 2, arrowLeaderImgWidth, arrowLeaderImgHeight);
	
	ctx->Restore();
}

#ifdef DEBUG
void GameRendering::FinishedFrame(Context *ctx, double took)
{
	if(m_FrameTimes.size() > 120) m_FrameTimes.erase(m_FrameTimes.begin());
	m_FrameTimes.push_back(took);
}

void GameRendering::DrawConfigInfo(Context *ctx)
{
    char text[128];
    snprintf(text, sizeof(text), "Config Version: %s Valid Boids: %u", m_pGame->Configuration()->GetConfigVersion().c_str(), m_pGame->NumberOfValidBoids());
    m_ConfigText.SetSize(ScreenSpace(16));
    m_ConfigText.SetValue(text);
    ctx->DrawImage(m_ConfigText.Render(), ScreenSpace(16), ScreenSpace(88));
}

void GameRendering::DrawFPS(Context *ctx)
{
	if(m_FrameTimes.empty()) return;
	
	double avgFrameTime = 0.0;
	double minFrameTime = std::numeric_limits<double>::infinity();
	double maxFrameTime = 0.0;
	for(auto &v : m_FrameTimes)
	{
		avgFrameTime += v;
		minFrameTime = std::min(minFrameTime, v);
		maxFrameTime = std::max(maxFrameTime, v);
	}
	avgFrameTime /= m_FrameTimes.size();
	
	char text[128];
	snprintf(text, sizeof(text), "Rendering (ms): %.1lf avg %.1lf min %.1lf max %.0lf tfps %.0lf tmfps %d fps",
		double(avgFrameTime),
		double(minFrameTime),
		double(maxFrameTime),
		1000.0 / avgFrameTime,
		1000.0 / maxFrameTime,
		m_iFPS
	);
	
	m_FPSMeter.SetSize(ScreenSpace(16));
	m_FPSMeter.SetValue(text);
	ctx->DrawImage(m_FPSMeter.Render(), ScreenSpace(16), ScreenSpace(16));
}

void GameRendering::DrawMemory(Context *ctx)
{
	/*char text[128];
	snprintf(text, sizeof(text), "Heap usage: %.2lf MB / %.2lf MB, Cells: %u / %u, %u points, %d ctxs, %d imgs",
		double(uint32_t(sbrk(0)))/1024/1024, double(TOTAL_MEMORY)/1024/1024, Cell::GetTotalCellsInUse(), Cell::GetTotalCellsAllocated(), m_iPointCount,
		cp5::num_contexts, cp5::num_images
	);
	
	m_MemoryText.SetSize(ScreenSpace(16));
	m_MemoryText.SetValue(text);
	ctx->DrawImage(m_MemoryText.Render(), ScreenSpace(16), ScreenSpace(40));*/
}

void GameRendering::DrawNetwork(Context *ctx)
{
	char text[128];
	snprintf(text, sizeof(text), "Network: %.1lf KB/s down %.1lf KB/s up - Total: %.1lf MB down, %.1lf MB up",
		m_pGame->Networking()->GetDownloadRate() / 1024.0, m_pGame->Networking()->GetUploadRate() / 1024.0,
		m_pGame->Networking()->GetTotalDownload() / 1024.0 / 1024.0, m_pGame->Networking()->GetTotalUpload() / 1024.0 / 1024.0
	);
	
	m_NetworkText.SetSize(ScreenSpace(16));
	m_NetworkText.SetValue(text);
	ctx->DrawImage(m_NetworkText.Render(), ScreenSpace(16), ScreenSpace(64));
}
#endif


void GameRendering::SolveCamera()
{
    if (!m_pGame->IsPlayerAlive())
        return;
    
	CalculateDesiredZoom();
	if(m_bFirstRender)
	{
		m_bFirstRender = false;
		m_fAnimZoom = GetDesiredZoom();
		m_SpecCamera.zoom = m_Camera.zoom = GetDesiredZoom();
	}
	else
	{
		m_fAnimZoom = (9 * m_fAnimZoom + GetDesiredZoom()) / 10.0;
	}
	
    m_Camera.zoom = m_fAnimZoom * GetZoomScreenFactor();
    const std::vector<Cell*>& cells = m_pGame->Cells()->GetMyCells();
	
	if(m_pGame->Cells()->PlayerHasCells())
	{
		double avgX = 0, avgY = 0;
		int validCount = 0;
        
        size_t totalCells = cells.size();
        
        if (totalCells > 1)
		{
            auto cellsX = std::vector<float>();
            auto cellsY = std::vector<float>();
                                              
            for(auto v: cells)
			{
                v->UpdatePos();

                //if(v->CalcVelocityNorm() < 50) {
                if(!v->IsBullet() && !v->IsSplitting())
				{
                    cellsX.push_back(v->GetX());
                    cellsY.push_back(v->GetY());
                    
                    validCount++;
                }
            }
            
            std::sort(cellsX.begin(), cellsX.end());
            std::sort(cellsY.begin(), cellsY.end());
            
            if (validCount > 0)
			{
                if ( validCount % 2 == 1 )
				{
                    int middle = round((validCount - 1) * 0.5);
                    avgX = cellsX[middle];
                    avgY = cellsY[middle];
                }
				else
				{
                    int middleL = floor((validCount - 1) * 0.5);
                    int middleR = ceil((validCount - 1) * 0.5);
                    avgX = cellsX[middleL] + cellsX[middleR];
                    avgX *= 0.5;
                    avgY = cellsY[middleL] + cellsY[middleR];
                    avgY *= 0.5;
                }
            }
			else
			{
                avgX = m_Camera.x;
                avgY = m_Camera.y;
            }
        }
		else if (!cells[0]->IsBullet() && !cells[0]->IsSplitting())
		{
            avgX = cells[0]->GetX();
            avgY = cells[0]->GetY();
        }
		else
		{
            avgX = m_Camera.x;
            avgY = m_Camera.y;
        }
        
        m_Camera.x = (m_Camera.x * 2 + avgX) / 3;
        m_Camera.y = (m_Camera.y * 2 + avgY) / 3;

		m_SpecCamera.x = avgX;
		m_SpecCamera.y = avgY;
		m_SpecCamera.zoom = m_fAnimZoom * 1.1;
	}
	else
	{
		m_Camera.x = (m_Camera.x * 29 + m_SpecCamera.x) / 30;
		m_Camera.y = (m_Camera.y * 29 + m_SpecCamera.y) / 30;
	}

	//pixi.SetStagePosition(m_Camera.x, m_Camera.y);
}

void GameRendering::CalculateDesiredZoom()
{
	LimitUserZoom();
	
	double f = 1.0;
	if(m_pGame->Cells()->PlayerHasCells())
	{
		double totalRadius = 0.0;
		for(auto v: m_pGame->Cells()->GetMyCells())
		{
			totalRadius += v->GetRadius();
		}
		
		f *= std::pow(std::min(64.0 / totalRadius, 1.0), 1.0/2.5) * m_fUserZoom;
		f = 1;
	}
	else
	{
		f *= m_SpecCamera.zoom * m_fUserZoom;
	}
	
	m_fDesiredZoom = f;
}

void GameRendering::RenderGrid(Context *ctx)
{
    if (m_Grid == nullptr)
        m_Grid = new Image("img/BG.jpg");

    int gridWidth = m_Grid->Width();
    int gridHeight = m_Grid->Height();
    
    ctx->Save();
    
    float m_fCameraX = m_Camera.x;
    float m_fCameraY = m_Camera.y;
    
    float z = GetZoom();
    
    auto pattern = [&](){
        return ctx->CreatePattern(m_Grid);
    }();
        
    float xx = -m_fCameraX + g_Screen.width  / 2.0 / z;
    float yy = -m_fCameraY + g_Screen.height / 2.0 / z;
    
    float xOffset = FMod(FMod(xx, gridWidth) + gridWidth, gridWidth);
    float yOffset = FMod(FMod(yy, gridHeight) + gridHeight, gridHeight);
    
    ctx->SetAlpha(0.75f);
    ctx->Scale(z, z);
    ctx->FillPattern(pattern, xOffset - gridWidth, yOffset - gridHeight, g_Screen.width / z + gridWidth, g_Screen.height / z + gridHeight);
    ctx->Restore();
}

void GameRendering::RenderBackground(Context *ctx)
{
    if (!m_pGame->Configuration()->IsDrawStarfieldEnabled()) return;
	if(m_GraphicSettings == GraphicSettings::LOW) return;    

    static Image bg("img/BG.jpg");
    static auto pattern = ctx->CreatePattern(&bg);
    
    float m_fCameraX = m_Camera.x;
    float m_fCameraY = m_Camera.y;
    
    double zoom = GetZoom() * .3;
    
    ctx->Save();
    
    if (m_fBackgroundAlpha > 0 && m_pGame->IsArenaClosing())
        m_fBackgroundAlpha -= 0.015;
    
    if (m_fBackgroundAlpha <= 0 && !m_bRenderingArenaClosingMessage) {
        m_AnnouncementsManager->Create("DANGER! UNIVERSE COLLAPSING!", AnnouncementType::DANGER);
        m_bRenderingArenaClosingMessage = true;
    }
    
    ctx->SetAlpha(Clamp(m_fBackgroundAlpha, 0.0, 1.0));
    
    zoom = GetZoom()* 1.1;
    float f_w = g_Screen.width  * ( 1 / zoom );
    float f_h = g_Screen.height * ( 1 / zoom );
    ctx->Scale( zoom, zoom);
    ctx->Rect( 0, 0, f_w, f_h );
    ctx->Translate( -m_fCameraX*0.3, -m_fCameraY*0.3 );
    ctx->FillStylePattern(pattern);
    ctx->Fill();
    ctx->Restore();
}

void GameRendering::RenderBackgroundPixi()
{
	float m_fCameraX = m_Camera.x;
    float m_fCameraY = m_Camera.y;
    
    double zoom = GetZoom() * .3;
    double f_w = g_Screen.width  * ( 1 / zoom );
    double f_h = g_Screen.height * ( 1 / zoom );
    
    //float xx = -m_fCameraX + g_Screen.width  / 2.0 / zoom;
    //float yy = -m_fCameraY + g_Screen.height / 2.0 / zoom;

	/*int rectID = */pixi.Background(m_fCameraX, m_fCameraY, f_w, f_h);
	//pixi.Translate(retID, xx, yy);
}

void GameRendering::RenderForeground(Context *ctx)
{
    if (true || !m_pGame->Configuration()->IsDrawStarfieldEnabled()) return;
    
    static Image bg("img/BG.jpg");
    static auto pattern = ctx->CreatePattern(&bg);
    
    double zoom = GetZoom() * 0.3;
    double f_w = g_Screen.width  * ( 1 / zoom );
    double f_h = g_Screen.height * ( 1 / zoom );
    
    ctx->Save();
    ctx->Scale( zoom, zoom);
    ctx->Rect( 0, 0, f_w, f_h );
    ctx->Translate( -m_Camera.x * 0.5, -m_Camera.y * 0.5);
    ctx->FillStylePattern(pattern);
    ctx->Fill();
    ctx->Restore();
}

void GameRendering::RenderLeaderboardCell(int pos, int realPos, std::string name, int score, bool isMe, Color color, Context *ctx)
{
    int w = ScreenSpace(250);
    
    if(isMe)
    {
        if(m_pGame->Cells()->PlayerHasCells()) name = m_pGame->Cells()->GetMyFleet()->GetName();
        ctx->FillColor(color);
    }
    else
    {
        ctx->FillColor(Color{0xFF, 0xFF, 0xFF});
    }
    
    std::stringstream ss;
    ss << (pos + 1) << ". ";
    ss << (name.empty() ? "An unknown fleet" : name);
    std::string NameTxt = ss.str();
    
    int txtW = ctx->MeasureText(NameTxt);
    int yPos = 70 + int(realPos) * 24;
    yPos = ScreenSpace(yPos);
    
    if(txtW > w - 5)
    {
        ctx->FillText(NameTxt, ScreenSpace(10), yPos);
    }
    else
    {
        ctx->FillText(NameTxt, ScreenSpace(10), yPos);
    }
    
    std::stringstream ssScore;
    ssScore << score;
    std::string ScoreTxt = ssScore.str();
    
    txtW = ctx->MeasureText(ScoreTxt);
    ctx->FillText(ScoreTxt, w - txtW - ScreenSpace(10), yPos);
}

void GameRendering::UpdateScoreboard()
{
	if(!Context::HaveFontsLoaded()) return;
	
	m_bHasScoreboard = true;
	
	Context *nctx = &m_ScoreboardCtx;
	
	int w = ScreenSpace(250);
	int h = ScreenSpace(20 + 40);
	
	auto &scoreboard = m_pGame->Networking()->GetScoreboard();
	auto &teamsScoreboard = m_pGame->Networking()->GetTeamsScoreboard();
	
	if(teamsScoreboard.empty()){
		h += ScreenSpace(24 * scoreboard.size());

		if(m_pGame->Cells()->PlayerHasCells())
		{
			auto leaderboardPos = m_pGame->Cells()->GetMyFleet()->GetLeaderboardPosition();

			if(leaderboardPos > SCOREBOARD_MAX_SIZE)
			{
				h += ScreenSpace(24);
			}
		}
	}else{
		h += ScreenSpace(180);
	}
	
	double s = ScreenSpace(g_Screen.width) * 0.12;
	
	s = std::min(1.2,s);
	s = std::max(1.0,s);
	

	nctx->SetSize(w * s, h * s);
	nctx->Scale(s, s);
	
	nctx->SetAlpha(0.4);
	nctx->FillColor(Color{0, 0, 0});
	nctx->FillRect(0, 0, w, h);
	
	nctx->SetAlpha(1.0);
	
	{
		nctx->FillColor(Color{255, 255, 255});
		std::string txt = "Leaderboard";
		nctx->SetFontSize(ScreenSpace(30));
		nctx->FillText(txt, int(w / 2 - nctx->MeasureText(txt) / 2), ScreenSpace(40));
	}
	
	if(teamsScoreboard.empty()){
		if(scoreboard.empty()){
			m_bHasScoreboard = false;
			return;
		}
		
		nctx->SetFontSize(ScreenSpace(20));
        
		for(size_t i = 0; i < scoreboard.size(); ++i)
		{
            RenderLeaderboardCell(i, i, scoreboard[i].name, scoreboard[i].score, scoreboard[i].isMe, scoreboard[i].color, nctx);
		}

		if(m_pGame->Cells()->PlayerHasCells())
		{	
			auto leaderboardPos = m_pGame->Cells()->GetMyFleet()->GetLeaderboardPosition();
            int myScore = m_pGame->Cells()->GetMyFleet()->GetScore();
            m_pGame->Stats()->SetScore(myScore);
            
			if(leaderboardPos > SCOREBOARD_MAX_SIZE)
			{
                RenderLeaderboardCell(leaderboardPos-1, SCOREBOARD_MAX_SIZE, m_pGame->Cells()->GetMyFleet()->GetName(), myScore, true, m_pGame->Cells()->GetMyFleet()->GetColor(), nctx);
            }
		}
	}
	else
	{
		int centerX = ScreenSpace(100);
		int centerY = ScreenSpace(140);
		double radius = ScreenSpace(80);
		
		double angStart = 0.0;
		for(size_t i = 0; i < teamsScoreboard.size(); ++i)
		{
			double angEnd = angStart + teamsScoreboard[i] * M_PI * 2;
			
			static Color TEAM_COLOR[] = {
				Color{0x33, 0x33, 0x33},
				Color{0xFF, 0x33, 0x33},
				Color{0x33, 0xFF, 0x33},
				Color{0x33, 0x33, 0xFF}	
			};
			
			nctx->FillColor(TEAM_COLOR[i + 1]);
			nctx->BeginPath();
			nctx->MoveTo(centerX, centerY);
			nctx->Arc(centerX, centerY, radius, angStart, angEnd, false);
			nctx->Fill();
			
			angStart = angEnd;
		}
	}
}

void GameRendering::RenderScoreboard(Context *ctx)
{
	if(!m_bHasScoreboard) return;
	
	int32_t w, h;
	m_ScoreboardCtx.GetSize(&w, &h);
	ctx->DrawImage(&m_ScoreboardCtx, g_Screen.width - w - ScreenSpace(15), ScreenSpace(15));
}

void GameRendering::RenderArenaHighscorer(Context *ctx)
{
	if(m_ArenaHighScorer.playerName == "") return;
	if(!m_pGame->Cells()->PlayerHasCells()) return;

    auto stats = m_pGame->Stats();
    if(m_pGame->Networking()->IsSpectating() || stats == nullptr) return;
    
	char highScoreTxt[128];
    char txt[128];

    snprintf(txt, sizeof(txt), "Arena Record: %u", m_ArenaHighScorer.score);
	snprintf(highScoreTxt, sizeof(highScoreTxt), "Fleet: %s", m_ArenaHighScorer.playerName.c_str());
    
    m_ArenaHighscorerTextLine1.SetSize(ScreenSpace(16));
    m_ArenaHighscorerTextLine1.SetHasStroke(true);
    m_ArenaHighscorerTextLine1.SetValue(txt);

	m_ArenaHighscorerTextLine2.SetSize(ScreenSpace(16));
    m_ArenaHighscorerTextLine2.SetHasStroke(true);
    m_ArenaHighscorerTextLine2.SetValue(highScoreTxt);
    
    int arenaHighscorerHeightBox = ScreenSpace(22);
	int arenaHighscorerWidthLine1 = m_ArenaHighscorerTextLine1.Width();
	int arenaHighscorerWidthLine2 = m_ArenaHighscorerTextLine2.Width();

	int32_t w, h;
	m_ScoreboardCtx.GetSize(&w, &h);
	int yPosLine1 = g_Screen.height - (arenaHighscorerHeightBox + arenaHighscorerHeightBox + ScreenSpace(10));
	int yPosLine2 = g_Screen.height - (arenaHighscorerHeightBox + ScreenSpace(10));
    
    ctx->SetAlpha(1.0);

	w = arenaHighscorerWidthLine1 > arenaHighscorerWidthLine2 ? g_Screen.width - arenaHighscorerWidthLine1 - ScreenSpace(15) : g_Screen.width - arenaHighscorerWidthLine2 - ScreenSpace(15);
	w = ScreenSpace(10);
	
	ctx->DrawImage(m_ArenaHighscorerTextLine1.Render(), w, yPosLine1 + (arenaHighscorerHeightBox - m_ArenaHighscorerTextLine1.Height())/2);
	ctx->DrawImage(m_ArenaHighscorerTextLine2.Render(), w, yPosLine2 + (arenaHighscorerHeightBox - m_ArenaHighscorerTextLine2.Height())/2);
}

void GameRendering::RenderKillStreak(Context *ctx)
{
	if(!m_pGame->Cells()->PlayerHasCells()) return;

    auto stats = m_pGame->Stats();
    if(m_pGame->Networking()->IsSpectating() || stats == nullptr) return;

    char txt[128];

    snprintf(txt, sizeof(txt), "Kill Streak: %u", m_iKillStreak);
    
    m_KillStreakText.SetSize(ScreenSpace(24));
    m_KillStreakText.SetHasStroke(true);
    m_KillStreakText.SetValue(txt);
    
    int killStreakHeightBox = ScreenSpace(34);
	int killStreakWidth = m_KillStreakText.Width();

	int yPos = killStreakHeightBox + ScreenSpace(10);
    
    ctx->SetAlpha(1.0);
	ctx->DrawImage(m_KillStreakText.Render(), ScreenSpace(5) + killStreakWidth, yPos + (killStreakHeightBox - m_KillStreakText.Height())/2);
}

void GameRendering::RenderWarning(Context *ctx)
{
	if(!m_bShowFPSWarning) return;
	
	Context *nctx = &m_WarningCtx;

	int w = 200;
	int h = 20;
	double s = g_Screen.width * 0.6 / w;

	nctx->SetSize(w * s, h * s);
	nctx->Scale(s, s);
	
	nctx->SetAlpha(0.4);
	nctx->FillColor(Color{0, 0, 0});
	nctx->FillRect(0, 0, w, h);
	
	nctx->SetAlpha(1.0);

	{
		nctx->FillColor(Color{255, 255, 255});
		std::string firstLineText = "Your computer is running slow";
		nctx->SetFontSize(4);
		nctx->FillText(firstLineText, int(w / 2 - nctx->MeasureText(firstLineText) / 2), 7);

		std::string secondLineText = "please close other applications or tabs in your browser to improve game performance.";
		nctx->SetFontSize(4);
		nctx->FillText(secondLineText, int(w / 2 - nctx->MeasureText(secondLineText) / 2), 14);
	}

	int32_t finalW, finalH;
	nctx->GetSize(&finalW, &finalH);

	ctx->DrawImage(&m_WarningCtx, (g_Screen.width - finalW)/2 , g_Screen.height - finalH - ScreenSpace(20));
}

void GameRendering::LimitUserZoom()
{
	if(m_fUserZoom < 1.0) m_fUserZoom = 1.0;
	if(m_fUserZoom > 4.0 / GetZoom()) m_fUserZoom = 4.0 / GetZoom();
}

void GameRendering::UserZoom(double amount)
{
	m_fUserZoom = m_fUserZoom * pow(0.9, amount);
}

//void GameRendering::RenderDeadZone(Context *ctx) {
//    Color color = Color(0xFFFFFF);
//    ctx->Save();
//    ctx->BeginPath();
//    ctx->MoveTo(g_Screen.width*0.5f, g_Screen.height*0.5f);
//    ctx->Arc(m_Camera.x, m_Camera.y, ScreenSpace(DEAD_ZONE), 0, 2*M_PI, true);
//    ctx->FillColor(color);
//    ctx->Fill();
//    ctx->Restore();
//}

static bool s_bFadeout = true;
extern "C" EMSCRIPTEN_KEEPALIVE void ac_set_fadeout(bool v){
	s_bFadeout = v;
}

void GameRendering::SetSlowFadeout(){
	s_bSlowFadeout = true;
}

void GameRendering::RenderFadeout(Context *ctx){
	bool shouldFadeout = s_bFadeout || !m_pGame->Networking()->IsConnected() || (!m_pGame->Cells()->PlayerHasCells() && !m_pGame->Networking()->IsSpectating());
	
	if(shouldFadeout){
		s_fFadeoutAmount += (s_bSlowFadeout ? 1.0 : 3.0) / 60.0;
		if(s_fFadeoutAmount > 1.0){
			s_fFadeoutAmount = 1.0;
			s_bSlowFadeout = false;
		}
	}else{
		s_fFadeoutAmount -= 3.0 / 60.0;
		if(s_fFadeoutAmount < 0.0){
			s_fFadeoutAmount = 0.0;
			s_bSlowFadeout = false;
		}
	}
	
	ctx->SetAlpha(0.7 * s_fFadeoutAmount);
	ctx->FillColor({0, 0, 0});
	ctx->FillRect(0, 0, g_Screen.width, g_Screen.height);
	ctx->SetAlpha(1.0);
}

void GameRendering::RenderConnecting(Context *ctx){
	if(m_pGame->Networking()->IsConnected()) return;
	if(m_pGame->Networking()->IsForcedDisconnect()) return;
	
	std::string txt = "Connecting";
	
	m_ConnectingText.SetSize(ScreenSpace(36));
	m_ConnectingText.SetValue(txt);
	auto w = m_ConnectingText.Width();
	auto h = m_ConnectingText.Height();
	
	int numDots = int(m_pGame->Now() / 300) % 6;
	if(numDots >= 4) numDots = 6 - numDots;
	for(int i = 0; i < numDots; ++i) txt.append(".");
	
	m_ConnectingText.SetValue(txt);
	ctx->DrawImage(m_ConnectingText.Render(), int((g_Screen.width / 2 - w / 2)), int((g_Screen.height / 2 - h)) - ScreenSpace(10));
}

void GameRendering::RenderScore(Context *ctx){
	if(!m_pGame->Cells()->PlayerHasCells()) return;
	if(m_pGame->Cells()->GetMyFleet() == nullptr) return;
	if(m_pGame->Networking()->IsSpectating()) return;
	if(m_bMinimalisticUI) return;

	auto score = m_pGame->Cells()->GetMyFleet()->GetScore();
	
	char txt[128];
	snprintf(txt, sizeof(txt), "Score: %d", (int) score);
	
	int scoreHeightBox = ScreenSpace(34);
	//int textWidth = m_ScoreText.Width();
	int yPos = scoreHeightBox + ScreenSpace(10);

	ctx->SetAlpha(1.0);
	m_ScoreText.SetSize(ScreenSpace(24));
	m_ScoreText.SetValue(txt);
	m_ScoreText.SetHasStroke(true);

	ctx->DrawImage(m_ScoreText.Render(), ScreenSpace(10), yPos + (scoreHeightBox - m_ScoreText.Height())/2);
}

void GameRendering::RenderPlayerName(Context *ctx){
	auto stats = m_pGame->Stats();
	if(m_pGame->Networking()->IsSpectating() || stats == nullptr) return;
	
	int textHeightBox = ScreenSpace(47);
	int textWidth = m_NameText.Width();
	int yPos = g_Screen.height - textHeightBox - ScreenSpace(70);

	ctx->SetAlpha(1.0);
	m_NameText.SetSize(ScreenSpace(24));
	m_NameText.SetValue(m_MyFleetName.c_str());
	m_NameText.SetHasStroke(false);

	ctx->DrawImage(m_NameText.Render(), g_Screen.width / 2 - ScreenSpace(textWidth / 2), yPos + (textHeightBox - m_NameText.Height())/2);
}

void GameRendering::RenderPlayerNamePixi()
{
	int textHeightBox = ScreenSpace(47);
	int textWidth = m_NameText.Width();
	int yPos = g_Screen.height - textHeightBox - ScreenSpace(70);

	pixi.CreateText(ScreenSpace(24), m_MyFleetName.c_str(), g_Screen.width / 2 - ScreenSpace(textWidth / 2), yPos + (textHeightBox - m_NameText.Height())/2);
}

void GameRendering::RenderPlayerStats(Context *ctx){
	if(!m_pGame->Cells()->PlayerHasCells()) return;

    auto stats = m_pGame->Stats();
    if(m_pGame->Networking()->IsSpectating() || stats == nullptr) return;
    
    uint16_t size = 0;
    
    for(auto v: m_pGame->Cells()->GetMyCells()){
        if (v->IsValidBoid()) size++;
    }
    
    char txt[128];
    snprintf(txt, sizeof(txt), "Size: %d", size);
    
    m_StatsText.SetSize(ScreenSpace(24));
    m_StatsText.SetHasStroke(true);
    m_StatsText.SetValue(txt);
    
    int scoreHeightBox = ScreenSpace(34);
    int scoretextWidth = m_ScoreText.Width();
    int textWidth = m_StatsText.Width();
    int yPos = scoreHeightBox + ScreenSpace(10);
    
    ctx->SetAlpha(1.0);
	ctx->DrawImage(m_StatsText.Render(), m_bMinimalisticUI ? ScreenSpace(10) : (ScreenSpace(22) + scoretextWidth + ScreenSpace(2)), yPos + (scoreHeightBox - m_StatsText.Height())/2);
    
	if(!m_bMinimalisticUI)
	{
		snprintf(txt, sizeof(txt), "Next: %d/%d", stats->currentFoodForNextBoid, stats->foodForNextBoid);
		
		m_StatsText.SetValue(txt);

		ctx->SetAlpha(1.0);
		ctx->DrawImage(m_StatsText.Render(), ScreenSpace(32) + textWidth + scoretextWidth, yPos + (scoreHeightBox - m_StatsText.Height())/2);
	}
}

void GameRendering::RenderAutofire(Context *ctx){
	auto stats = m_pGame->Stats();
	if(m_pGame->Networking()->IsSpectating() || stats == nullptr) return;
	
	char txt[128];
	snprintf(txt, sizeof(txt), "Autofire (E) : %s", m_bIsInAutofire ? "ON" : "OFF");

	m_AutofireText.SetSize(ScreenSpace(24));
    m_AutofireText.SetHasStroke(true);
    m_AutofireText.SetValue(txt);
    
    int autofireHeightBox = ScreenSpace(34);
    int textWidth = m_AutofireText.Width();
    int yPos = g_Screen.height - autofireHeightBox - ScreenSpace(5);
    
    ctx->SetAlpha(1.0);
    ctx->DrawImage(m_AutofireText.Render(), g_Screen.width - textWidth - ScreenSpace(2), yPos + (autofireHeightBox - m_AutofireText.Height())/2);
}

void GameRendering::RenderGauge(Context *ctx){
    auto stats = m_pGame->Stats();
    if(m_pGame->Networking()->IsSpectating() || stats == nullptr) return;
    
    int barWidth = g_Screen.width * 0.2;
	int barHeight = ScreenSpace(10);
    
    int xPos = g_Screen.width * 0.5 - barWidth * 0.5;
    int yPos = g_Screen.height - ScreenSpace(60);
    
    ctx->Save();
    ctx->SetAlpha(0.5);
    ctx->StrokeColor(Color(0x10, 0x1E, 0x62));
    ctx->StrokeWidth(barHeight);
    ctx->BeginPath();
    ctx->SetLineCap(cp5::CTX_LINE_CAP_ROUND);
    ctx->MoveTo(xPos, yPos);
    ctx->LineTo(xPos + barWidth, yPos);
    ctx->Stroke();
    ctx->Restore();
    
    double cooldown = (double)m_pGame->Stats()->cooldown;
    
    bool isFull = cooldown >= 1.0;
    
    ctx->Save();
    ctx->SetAlpha(1.0);
    ctx->StrokeColor( isFull ? Color(0,255,0) : Color(255,0,0) );
	if(m_GraphicSettings != GraphicSettings::LOW) ctx->ShadowBlur(30, isFull ? Color(0,255,0) : Color(255,0,0));
    ctx->StrokeWidth(barHeight);
    ctx->BeginPath();
    ctx->SetLineCap(cp5::CTX_LINE_CAP_ROUND);
    ctx->MoveTo(xPos, yPos);
    ctx->LineTo(xPos + barWidth * cooldown, yPos);
    ctx->Stroke();
    ctx->Restore();
}

void GameRendering::RenderBorders(Context *ctx)
{
    if(m_pGame->Networking()->IsConnected())
    {
        float x1 = std::max<float>(0.0, ScreenX( m_pGame->Rendering()->GetMinX()));
        float y1 = std::max<float>(0.0, ScreenY( m_pGame->Rendering()->GetMinY()));
        float x2 = std::min<float>(g_Screen.width, ScreenX( m_pGame->Rendering()->GetMaxX()));
        float y2 = std::min<float>(g_Screen.height, ScreenY(m_pGame->Rendering()->GetMaxY()));
        
        ctx->Save();
        ctx->SetAlpha(1.0);
        ctx->BeginPath();
        ctx->StrokeWidth(10);
        ctx->StrokeColor(Color(0,0,0));
        ctx->FillColor(Color(0x220000));
        ctx->FillRect(0, y1, x1, g_Screen.height - y1);
        ctx->FillRect(0, 0, x2, y1);
        ctx->FillRect(x2, 0, g_Screen.width - x2, y2);
        ctx->FillRect(x1, y2, g_Screen.width - x1, g_Screen.height - y2);
        ctx->Stroke();
        ctx->ClosePath();
        ctx->Restore();
    }
}

void GameRendering::RenderDangerZone(Context *ctx)
{
    if(m_pGame->Networking()->IsConnected())
    {
        float x1 = std::max<float>(-16, ScreenX( m_pGame->Rendering()->GetDeadZoneMinX()));
        float y1 = std::max<float>(-16, ScreenY( m_pGame->Rendering()->GetDeadZoneMinY()));
        float x2 = std::min<float>(g_Screen.width+16, ScreenX( m_pGame->Rendering()->GetDeadZoneMaxX()));
        float y2 = std::min<float>(g_Screen.height+16, ScreenY(m_pGame->Rendering()->GetDeadZoneMaxY()));
        
        ctx->Save();
        
        ctx->FillColor(Color(0x220000));
        ctx->FillRect(0, y1, x1, g_Screen.height - y1);
        ctx->FillRect(0, 0, x2, y1);
        ctx->FillRect(x2, 0, g_Screen.width - x2, y2);
        ctx->FillRect(x1, y2, g_Screen.width - x1, g_Screen.height - y2);
        
        // draw danger zone lines
        ctx->SetLineJoin(cp5::CTX_LINE_JOIN_ROUND);
        ctx->SetLineWidth(5);
        ctx->StrokeColor(Color(0xFF0000));
        ctx->BeginPath();
        if(m_GraphicSettings != GraphicSettings::LOW) ctx->ShadowBlur(50, 255, 0, 0);
        ctx->MoveTo(x1, y1);
        ctx->LineTo(x1, y2);
        ctx->LineTo(x2, y2);
        ctx->LineTo(x2, y1);
        ctx->ClosePath();
        ctx->Stroke();
    
        ctx->Restore();
    }
}

void GameRendering::RenderLogo(Context *ctx)
{
	if(!m_pGame->Networking()->IsConnected() || (m_pGame->Cells()->PlayerHasCells() && !m_pGame->Networking()->IsSpectating())) return;

	Context logoContext;

	Image *logo = GetImageByName("main_menu/Space1_Logo");

	int width = ScreenSpace(logo->Width());
	int height = ScreenSpace(logo->Height());

	ctx->Save();

	ctx->DrawImage(logo, g_Screen.width/ 2 - width / 2, 1, width, height);

	ctx->Restore();

}

void GameRendering::RenderAnnouncements(Context *ctx)
{
    m_AnnouncementsManager->Render(ctx);
}

bool GameRendering::CanShoot()
{
	auto stats = m_pGame->Stats();
    if(m_pGame->Networking()->IsSpectating() || stats == nullptr) return false;
    return stats->cooldown >= 1;
}

Image* GameRendering::GetImageByName(std::string imageName)
{
	auto element = m_pGameImages.find(imageName);
		
	if(element == m_pGameImages.end())
	{
		std::string strImageName("img/");
		strImageName += imageName;
		strImageName += ".png";
		auto emplaceReturn = m_pGameImages.emplace(imageName, std::shared_ptr<Image>(new Image(strImageName.c_str())));

		element = emplaceReturn.first;
	}
	
	return element->second.get();
}

void GameRendering::SetGraphics(const char* setting)
{
	std::string settingStr {setting};
	if(settingStr == "high")
	{
		m_GraphicSettings = GraphicSettings::HIGH;
	}

	if(settingStr == "medium")
	{
		m_GraphicSettings = GraphicSettings::MEDIUM;
	}

	if(settingStr == "low")
	{
		m_GraphicSettings = GraphicSettings::LOW;
	}
}
