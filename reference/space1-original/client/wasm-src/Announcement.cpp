//
//  Announcement.cpp
//  Flocks.io - GameClient
//
//  Created by Pedro Geraldes on 11/01/17.
//  Copyright © 2017 Miniclip. All rights reserved.
//

#include "Announcement.h"
#include "Game.h"

Announcement::Announcement(const std::string &message, AnnouncementType type, bool withTimer, int timer, int delay) : m_bWithTimer(withTimer), m_sMessage(message), m_eType(type) {
    m_iAnnouncementTimer = timer;
    m_iOriginalAnnouncementTimer = timer;
    m_iDelayTime = delay;
    switch (m_eType) {
        case MESSAGE:
            CreateMessage();
            break;
        case DANGER:
            //CreateDanger();
            break;
        case KILL_POINTS:
            CreateKillPoints();
            break;
        case ARENA_CLOSING:
            CreateArenaClosing();
            break;
        case POINTS_GAIN:
            CreatePointsGain();
            break;
        case EVENT:
            CreateEvent();
            break;
        default:
            assert(0);
    }
}

Announcement::~Announcement() {
    
}

void Announcement::Render(Context* ctx) {    
    switch (m_eType) {
        case MESSAGE:
            RenderMessage(ctx);
            break;
        case DANGER:
            RenderDanger(ctx);
            break;
        case KILL_POINTS:
            RenderKillPoints(ctx);
            break;
        case ARENA_CLOSING:
            RenderArenaClosing(ctx);
            break;
        case POINTS_GAIN:
            RenderPointsGain(ctx);
            break;
        case EVENT:
            RenderEvent(ctx);
            break;
        default:
            assert(0);
    }
}

void Announcement::CreateMessage() {
    m_ctx.SetSize(m_iWidth * m_fScale, m_iHeight * m_fScale);
    m_ctx.Scale(m_fScale, m_fScale);

    m_ctx.FillColor(BACKGROUND_COLOR);
    m_ctx.SetFontSize(FONT_SIZE);
    m_ctx.FillText(m_sMessage, int(m_iWidth / 2 - m_ctx.MeasureText(m_sMessage) / 2), 7);
}

void Announcement::RenderMessage(Context* ctx) {
    int32_t finalW, finalH;
    m_ctx.GetSize(&finalW, &finalH);
    
    ctx->DrawImage(&m_ctx, (g_Screen.width - finalW) / 2, (g_Screen.height / 3) - finalH - ScreenSpace(200));
}

void Announcement::RenderDanger(Context* ctx) {
    RenderMessage(ctx);
    
    static Image *dangerZone = new Image("img/Danger_Zone.png");
    
    int width = ScreenSpace(dangerZone->Width());
    int height = ScreenSpace(dangerZone->Height());
    
    ctx->DrawImage(dangerZone, g_Screen.width*0.5f-width*0.5, g_Screen.height*0.25f-height*0.5, width, height);
}

void Announcement::CreateKillPoints() {
    m_ctx.SetSize(m_iWidth * m_fScale, m_iHeight * m_fScale);
    m_ctx.Scale(m_fScale, m_fScale);
    
    m_ctx.FillColor(BACKGROUND_COLOR);
    m_ctx.SetFontSize(FONT_SIZE);
    m_ctx.FillText(m_sMessage, m_iWidth * 0.5f - m_ctx.MeasureText(m_sMessage) * 0.5f, m_iHeight*0.75f);
}

void Announcement::RenderKillPoints(Context* ctx) {
    int32_t finalW, finalH;
    m_ctx.GetSize(&finalW, &finalH);
    
    ctx->DrawImage(&m_ctx, (g_Screen.width - finalW) / 2, (g_Screen.height / 3) - finalH - ScreenSpace(100));
}

void Announcement::CreateArenaClosing() {
    m_ctx.SetSize(m_iWidth * m_fScale, m_iHeight * m_fScale);
    m_ctx.Scale(m_fScale, m_fScale);
    
    m_ctx.FillColor(BACKGROUND_COLOR);
    m_ctx.SetFontSize(FONT_SIZE);
    m_ctx.FillText(m_sMessage, m_iWidth * 0.5f - m_ctx.MeasureText(m_sMessage) * 0.5f, m_iHeight*0.75f);
}

void Announcement::RenderArenaClosing(Context* ctx) {
    int32_t finalW, finalH;
    m_ctx.GetSize(&finalW, &finalH);
    
    ctx->DrawImage(&m_ctx, (g_Screen.width - finalW) / 2, (g_Screen.height / 2) + finalH + ScreenSpace(100));
}

void Announcement::CreateEvent() {
    m_ctx.SetSize(m_iWidth * m_fScale, m_iHeight * m_fScale);
    m_ctx.Scale(m_fScale, m_fScale);
    
    m_ctx.FillColor(BACKGROUND_COLOR);
    m_ctx.SetFontSize(FONT_SIZE*0.4f);
    m_ctx.FillText(m_sMessage, m_iWidth * 0.5f - m_ctx.MeasureText(m_sMessage) * 0.5f, m_iHeight*0.75f);
}

void Announcement::RenderEvent(Context* ctx)
{
    int32_t finalW, finalH;

    m_iWidth = 15;
    m_iHeight = 15;
    
    m_ctx.GetSize(&finalW, &finalH);

    ctx->DrawImage(&m_ctx, (g_Screen.width - finalW - m_ctx.MeasureText(m_sMessage)) - ScreenSpace(10), (g_Screen.height / 2) + finalH);
}

void Announcement::CreatePointsGain() {
    
    m_iWidth = 10;
    m_iHeight = 10;
    int m_ctxWidth = m_iWidth * m_fScale;
    int m_ctxHeight = m_iHeight * m_fScale;
    
    m_ctx.SetSize(m_ctxWidth, m_ctxHeight);
    m_ctx.Scale(m_fScale, m_fScale);
    
    m_ctx.FillColor(BACKGROUND_COLOR);
    
    if (m_iBoidID == 0) {
        m_ctx.SetFontSize(FONT_SIZE*1.2f);
    }
    else {
        m_ctx.SetFontSize(FONT_SIZE*0.7f);
    }
    
    m_ctx.FillText(m_sMessage, m_iWidth * 0.5f - m_ctx.MeasureText(m_sMessage) * 0.5f, m_iHeight*0.75f);
}

void Announcement::RenderPointsGain(Context* ctx) {
    Cell* boid = g_Game.Cells()->ByID(m_iBoidID);
    
    if (m_iBoidID != 0 && boid == nullptr) {
        return;
    }
    
    int32_t finalW, finalH;
    m_ctx.GetSize(&finalW, &finalH);
    
    float oldAlpha = ctx->GetAlpha();
    float updateValue = m_iAnnouncementTimer / (float)m_iOriginalAnnouncementTimer;
    ctx->SetAlpha(updateValue);
    
    double cameraX = g_Game.Rendering()->GetCameraX();
    double cameraY = g_Game.Rendering()->GetCameraY();
    
    float posX, posY;
    
    if (m_iBoidID == 0) {
        posX = g_Screen.width*0.5f - finalW*0.5f-m_ctx.MeasureText(m_sMessage);
        posY = g_Screen.height*0.5f - finalH*0.5f - ScreenSpace(75) - g_Screen.height * 0.1 * (1.0f-updateValue);
    }
    else {
        double offsetX = boid->GetX() - cameraX;
        double offsetY = boid->GetY() - cameraY;
        posX = g_Screen.width*0.5f + offsetX - finalW*0.5f-m_ctx.MeasureText(m_sMessage);
        posY = g_Screen.height*0.5f + offsetY - finalH*0.5f - ScreenSpace(30) - g_Screen.height * 0.1 * (1.0f-updateValue);
    }
    
    ctx->DrawImage(&m_ctx, posX, posY);
    
    ctx->SetAlpha(oldAlpha);
}
