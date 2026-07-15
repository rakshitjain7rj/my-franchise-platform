import React from 'react'
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { User } from 'lucide-react';





function ContactInfo() {
    return (
        <div>
            <Card className='bg-white rounded-none'>
                <CardContent className='space-y-4'>
                    <div className="flex items-center space-x-2 mb-6">

                        <User className="w-8 h-8 text-[#4A154B]" />
                        <div>
                            <h2 className="text-2xl  text-[#4A154B] tracking-tight">Contact Information</h2>
                        </div>
                    </div>
                    <div className='space-y-4'>
                        <Label>EMAIL ADDRESS</Label>
                        <Input type="email" placeholder="Put your Email Address here" />
                        <div className='flex items-center gap-2'>
                            <Checkbox />
                            <span>Email with news and exclusive offers </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default ContactInfo