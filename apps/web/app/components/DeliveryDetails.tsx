import React from 'react'
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Truck } from 'lucide-react';




function DeliveryDetails() {
    return (
        <div>
            <Card className='bg-white rounded-none'>
                <CardContent className='space-y-4' >
                    <div className="flex items-center space-x-2 mb-6">

                        <Truck className="w-8 h-8 text-[#4A154B]" />
                        <div>
                            <h2 className="text-2xl  text-[#4A154B] tracking-tight">Payment Method</h2>
                        </div>
                    </div>

                    <div className='space-y-4'>
                        <div className='grid grid-cols-2 gap-4'>
                            <div className='space-y-4'>
                                <Label>FIRST NAME</Label>
                                <Input type="text" placeholder='Enter here' />
                            </div>
                            <div className='space-y-4'>
                                <Label>LAST NAME</Label>
                                <Input type="text" placeholder='Enter here' />
                            </div>
                        </div>
                        <div className='space-y-4'>
                            <Label>ADDRESS</Label>
                            <Input type="text" placeholder='Enter Address here' />
                        </div>
                        <div className='space-y-4'>
                            <Label>APARTMENT , SUITES, ETC.(OPTIONAL)</Label>
                            <Input type="text" placeholder='Enter Address here' />
                        </div>
                        <div className='grid grid-cols-2 gap-4 '>
                            <div className='space-y-4'>
                                <Label>CITY </Label>
                                <Input type="text" placeholder='Enter here' />
                            </div>
                            <div className='space-y-4'>
                                <Label>POSTAL CODE</Label>
                                <Input type="text" placeholder='Enter here' />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default DeliveryDetails