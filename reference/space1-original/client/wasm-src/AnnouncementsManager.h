//
//  AnnouncementsManager.h
//  Flocks.io - GameClient
//
//  Created by Pedro Geraldes and Aleixo o maior on 24/04/17.
//  Copyright © 2017 Miniclip. All rights reserved.
//

#ifndef _ANNOUNCEMENT_MANAGER_H_
#define _ANNOUNCEMENT_MANAGER_H_

#include "stdafx.h"

#include "AnnouncementType.h"

class Announcement;

class AnnouncementsManager {
    
public:
    inline AnnouncementsManager() { }
    
    Announcement* Create(const std::string& message, AnnouncementType type, bool withTimer = false, int timer = 90);
    
    void DeleteAndEraseAnnouncement(std::vector<Announcement*>::iterator it);
    
    void ClearAll();
    void ClearAllOfType(AnnouncementType type);
    bool CheckCollisionWithType(AnnouncementType type);
    uint32_t GetNumAnnouncementsForType(AnnouncementType type);

    void Update();
    void Render(Context *ctx);
    
private:
    std::vector<Announcement*> m_vAnnouncementQueue;
    
};

#endif /* _ANNOUNCEMENT_MANAGER_H_ */
