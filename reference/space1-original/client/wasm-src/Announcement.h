//
//  Announcement.h
//  Flocks.io - GameClient
//
//  Created by Pedro Geraldes and Aleixo o maior on 11/01/17.
//  Copyright © 2017 Miniclip. All rights reserved.
//

#ifndef _ANNOUNCEMENT_H_
#define _ANNOUNCEMENT_H_

#include "stdafx.h"
#include "GameRendering.h"
#include "AnnouncementType.h"



#define BACKGROUND_COLOR Color{255, 255, 255}
#define FONT_SIZE 4

class Announcement {
    
public:
    
    int ScreenSpace(double v){
        return v * std::min(g_Screen.width / 1920.0, g_Screen.height / 1080.0);
    }
    
    Announcement(const std::string &message, AnnouncementType type, bool withTimer, int timer = 90, int delay = 0);
    ~Announcement();
    
    AnnouncementType GetType() { return m_eType; }
    
    bool canOverlap() { return m_bCanOverlap; }
    inline void SetMessage(const std::string &message) { m_sMessage = message; }
    inline void SetCanOverlap(bool canOverlap) { m_bCanOverlap = canOverlap; }
    inline void FollowBoid(uint32_t boidID) { m_iBoidID = boidID; }
    void Render(Context* ctx);
    void RenderDanger(Context* ctx);
    void CreateEvent();
    void RenderEvent(Context* ctx);
    void CreateKillPoints();
    void RenderKillPoints(Context* ctx);
    void CreateMessage();
    void RenderMessage(Context* ctx);
    void CreatePointsGain();
    void RenderPointsGain(Context* ctx);
    void CreateArenaClosing();
    void RenderArenaClosing(Context *ctx);
    
    uint32_t m_iBoidID = 0;
    
    double m_fOpacity = 1.0;
    int m_iOriginalAnnouncementTimer = 0;
    int m_iDelayTime = 0;
    int m_iAnnouncementTimer = 0;
    bool m_bIsToRemove = false;
    bool m_bWithTimer = false;

    int m_iWidth = 100;
    int m_iHeight = 10;
    double m_fScale = g_Screen.width * 0.6 / m_iWidth;
    
private:
    std::string m_sMessage;
    bool m_bCanOverlap = false;
    AnnouncementType m_eType;
    Context m_ctx;
    
};

#endif /* _ANNOUNCEMENT_H_ */
