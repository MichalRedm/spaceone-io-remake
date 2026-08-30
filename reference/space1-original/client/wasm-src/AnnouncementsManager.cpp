//
//  AnnouncementsManager.cpp
//  Flocks.io - GameClient
//
//  Created by Pedro Geraldes on 24/04/17.
//  Copyright © 2017 Miniclip. All rights reserved.
//

#include "AnnouncementsManager.h"
#include "Announcement.h"
#include "AnnouncementType.h"

Announcement* AnnouncementsManager::Create(const std::string& message, AnnouncementType type, bool withTimer, int timer)
{
    if (CheckCollisionWithType(type)) {     // check if announcement can be created
        Announcement* announcement = new Announcement(message, type, withTimer, timer, 0);
        announcement->m_iAnnouncementTimer = timer;
        m_vAnnouncementQueue.push_back(announcement);
        return announcement;
    }
    return nullptr;
}



void AnnouncementsManager::ClearAll() {
    m_vAnnouncementQueue.clear();
}

void AnnouncementsManager::DeleteAndEraseAnnouncement(std::vector<Announcement*>::iterator it) {
    delete *it;
    it = m_vAnnouncementQueue.erase(it);
}

void AnnouncementsManager::ClearAllOfType(AnnouncementType type)
{
    for(std::vector<Announcement*>::iterator it = m_vAnnouncementQueue.begin(); it!=m_vAnnouncementQueue.end(); ) {
        if ((*it)->GetType() == type) {
            DeleteAndEraseAnnouncement(it);
            return;
        }
        it++;
    }
}



bool AnnouncementsManager::CheckCollisionWithType(AnnouncementType type)
{
    if (type == AnnouncementType::POINTS_GAIN)
        return true;

    if (type == AnnouncementType::DANGER) {
        ClearAllOfType(AnnouncementType::MESSAGE);   // Danger is the priority over the regular messages
        return true;
    }
    
    for(std::vector<Announcement*>::iterator it = m_vAnnouncementQueue.begin(); it!=m_vAnnouncementQueue.end(); ) {
        if ((*it)->GetType() == AnnouncementType::DANGER) {     // Danger is the priority
            return false;
        }
        if ((*it)->GetType() == type) {
            DeleteAndEraseAnnouncement(it);
            return true;
        }
        it++;
    }
    return true;
}

void AnnouncementsManager::Update()
{
    for(std::vector<Announcement*>::iterator it = m_vAnnouncementQueue.begin(); it!=m_vAnnouncementQueue.end(); ) {
        if (!(*it)->m_bWithTimer) {
            if (!(*it)->m_bIsToRemove) {
                it++;
                continue;
            }
            else {
                DeleteAndEraseAnnouncement(it);
            }
        } else {
            
            if ((*it)->m_iDelayTime > 0 ) {
                (*it)->m_iDelayTime--;
                it++;
                continue;
            }
            
            if((*it)->m_fOpacity > 0.01)
                (*it)->m_fOpacity -= 0.01;
            
            if ((*it)->m_iAnnouncementTimer > 0) {
                (*it)->m_iAnnouncementTimer--;
                it++;
                continue;
            } else {
                DeleteAndEraseAnnouncement(it);
            }
            
        }
    }
}

void AnnouncementsManager::Render(Context *ctx)
{
    if(m_vAnnouncementQueue.size() <= 0) return;
    
    if(ctx == nullptr) return;

    for(std::vector<Announcement*>::iterator it = m_vAnnouncementQueue.begin(); it!=m_vAnnouncementQueue.end(); ) {
        (*it)->Render(ctx);
        if ((*it)->m_bIsToRemove) {
            DeleteAndEraseAnnouncement(it);
        }
        else
            it++;
    }
    
    Update();
}

uint32_t AnnouncementsManager::GetNumAnnouncementsForType(AnnouncementType type)
{
    uint32_t numAnnouncements = 0;

    for(auto announcement : m_vAnnouncementQueue)
    {
        if(announcement->GetType() == type) numAnnouncements++;
    }

    return numAnnouncements == 0 ? numAnnouncements = 1 : numAnnouncements;
}
